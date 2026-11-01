import { LatestOutbox } from './outbox';
import { readVersusInput, EMPTY_VERSUS_INPUT, compactVersus, expandVersus } from './versus';
import type { VersusState, VersusInput } from './versus';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type { ArcadeInput } from '../arcade/engine';
import type { ArcadeSnapshot } from './snapshot';
import { DEITIES } from '../game/deities';
import { EMPTY_LAN_INPUT, LAN_VERSION, readLanInput, readLanInvite, readLanStart } from './protocol';
import type { LanStart } from './protocol';

export interface NativeWifi {
  host(): Promise<{ addresses: string[]; port: number; token: string }>;
  join(invite: { host: string; port: number; token: string }): Promise<void>;
  send(message: { data: string }): Promise<void>;
  close(): Promise<void>;
  copy(options: { text: string }): Promise<void>;
  scan(): Promise<{ text?: string }>;
  addListener(event: string, callback: (event: Record<string, unknown>) => void): Promise<PluginListenerHandle>;
}
const Wifi = registerPlugin<NativeWifi>('LocalWifi');
export const hasLocalWifi = () => Capacitor.getPlatform() === 'android';
type Packet = { kind: string; value?: unknown; version: number; round?: number };
const ROUND_PACKETS = new Set(['input', 'versus-input', 'state', 'versus-state', 'loaded', 'primed', 'go', 'pause', 'blessing', 'continue', 'rematch']);
type Outgoing = { kind: string; value: unknown; round: number };
function mergeControls(previous: Outgoing, next: Outgoing): Outgoing {
  if (previous.round !== next.round || previous.kind !== next.kind) return next;
  const old = previous.value as Record<string, boolean>, value = { ...next.value as Record<string, boolean> };
  for (const key of next.kind === 'input' ? ['attack', 'jump', 'magic', 'tapLeft', 'tapRight'] : ['light', 'special', 'heavyTap']) value[key] ||= old[key];
  return { ...next, value };
}

export class LanSession {
  readonly player: 0 | 1;
  connected = false;
  error = '';
  remoteDeity: string | null = null;
  remoteReady = false;
  invitations: string[] = [];
  config: LanStart | null = null;
  roomSettings: LanStart | null = null;
  snapshot: ArcadeSnapshot | null = null;
  versusState: VersusState | null = null;
  private heavyEdge = false;
  private versusInput = { ...EMPTY_VERSUS_INPUT };
  paused = false;
  localLoaded = false;
  remoteLoaded = false;
  private handles: PluginListenerHandle[] = [];
  private listeners = new Set<() => void>();
  private remoteInput = { ...EMPTY_LAN_INPUT };
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private lastRemote = 0;
  round = 0;
  ready = false;
  roundTripMs: number | null = null;
  jitterMs = 0;
  private remotePrimed = false;
  private primed = false;
  private starting = false;
  private pingId = 0;
  private pings = new Map<number, number>();
  private inputSignature = '';
  private offeredAt = -Infinity;
  private offeredHeavy = false;
  private receivedInputAt = -Infinity;
  private readonly states = new LatestOutbox<Outgoing>(packet => this.send(packet.kind, packet.value, packet.round));
  private readonly controls = new LatestOutbox<Outgoing>(packet => this.send(packet.kind, packet.value, packet.round), mergeControls);
  private closed = false;
  private commands: { kind: string; value?: unknown }[] = [];
  constructor(readonly role: 'host' | 'guest', private transport: NativeWifi = Wifi, private now: () => number = () => performance.now()) { this.player = role === 'host' ? 0 : 1; }
  static async scanInvite() { return (await Wifi.scan()).text; }
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private changed() { for (const listener of this.listeners) listener(); }
  get canSimulate() { return this.ready && this.connected && !this.error && !this.paused && this.localLoaded && this.remoteLoaded; }
  get connectionLabel() { return this.roundTripMs === null ? 'Midiendo conexión…' : `${Math.round(this.roundTripMs)} ms · ${this.roundTripMs > 150 || this.jitterMs > 45 ? 'Señal variable' : 'Red local'}`; }
  get startupMessage() {
    if (!this.connected) return 'Esperando conexión con el otro celular…';
    if (!this.localLoaded) return 'Preparando tu personaje y la arena…';
    if (!this.remoteLoaded) return 'El otro celular está preparando la partida…';
    return 'Sincronizando el inicio de ambos jugadores…';
  }
  private resetControls() {
    this.remoteInput = { ...EMPTY_LAN_INPUT }; this.versusInput = { ...EMPTY_VERSUS_INPUT }; this.heavyEdge = false;
    this.controls.clear(); this.inputSignature = ''; this.offeredAt = -Infinity; this.offeredHeavy = false;
  }
  private resetRound(round: number) {
    this.round = round; this.ready = this.primed = this.remotePrimed = false;
    this.localLoaded = this.remoteLoaded = false; this.snapshot = null; this.versusState = null;
    this.states.clear(); this.commands = []; this.resetControls();
  }
  private checkStartup() {
    if (this.role === 'host' && !this.ready && this.config && this.localLoaded && this.remoteLoaded && this.remotePrimed) {
      this.resetControls(); this.ready = true; void this.send('go'); this.changed();
    }
  }
  acknowledgeState() {
    if (this.role === 'guest' && !this.primed) { this.primed = true; void this.send('primed'); }
  }
  prepareRematch() {
    if (this.role !== 'host') return;
    this.resetRound(this.round + 1); void this.send('prepare'); this.changed();
  }
  pollConnection() {
    if (!this.connected || this.closed || this.error) return;
    const now = this.now(), timeout = this.paused || !this.ready || !this.localLoaded || !this.remoteLoaded ? 60000 : 15000;
    if (now - this.lastRemote > timeout) return this.fail('El compañero dejó de responder. Vuelve a crear o unirte a una sala.');
    const id = ++this.pingId; this.pings.set(id, now);
    while (this.pings.size > 8) this.pings.delete(this.pings.keys().next().value!);
    void this.send('ping', id);
    // Repetir el estado de carga permite recuperarse de la transición de pantallas.
    if (this.config && !this.ready) { void this.send('loaded', this.localLoaded); if (this.role === 'guest' && this.primed) void this.send('primed'); }
  }
  private fail(reason: string) {
    if (this.closed) return;
    this.error = reason; this.connected = false; this.paused = true;
    this.resetControls(); this.states.clear(); if (this.heartbeat) clearInterval(this.heartbeat); this.changed();
    void this.transport.close().catch(() => {});
  }
  private receive(raw: unknown) {
    if (this.closed || this.error) return;
    if (typeof raw !== 'string' || raw.length > 1024 * 1024) return this.fail('Mensaje de red inválido');
    let packet: Packet;
    try { packet = JSON.parse(raw); } catch { return this.fail('Mensaje de red inválido'); }
    if (!packet || packet.version !== LAN_VERSION) return this.fail('Ambos celulares necesitan la misma versión del juego');
    this.lastRemote = this.now();
    const { kind, value } = packet;
    if (kind === 'prepare' && this.role === 'guest' && Number.isSafeInteger(packet.round) && packet.round! > this.round) { this.resetRound(packet.round!); this.changed(); return; }
    if (ROUND_PACKETS.has(kind) && packet.round !== this.round) return;
    if (kind === 'primed' && this.role === 'host') { this.remotePrimed = true; this.checkStartup(); return; }
    if (kind === 'go' && this.role === 'guest' && this.primed) { this.resetControls(); this.ready = true; this.changed(); return; }
    if (kind === 'versus-input' && this.role === 'host') { const next = readVersusInput(value); if (next.heavyTap || next.heavy && !this.versusInput.heavy) this.heavyEdge = true; next.light ||= this.versusInput.light; next.special ||= this.versusInput.special; this.versusInput = next; this.receivedInputAt = this.now(); return; }
    if (kind === 'versus-state' && this.role === 'guest') { try { this.versusState = expandVersus(value as Parameters<typeof expandVersus>[0]); } catch { this.fail('Estado del duelo incompatible. Actualicen ambas APK.'); } return; }
    if (kind === 'settings' && this.role === 'guest') { this.roomSettings = readLanStart(value, DEITIES.map(deity => deity.id)); this.changed(); return; }
    if (kind === 'ping') { if (Number.isSafeInteger(value)) void this.send('pong', value); return; }
    if (kind === 'pong') {
      const sent = this.pings.get(Number(value));
      if (sent !== undefined) {
        this.pings.delete(Number(value)); const sample = Math.max(0, this.now() - sent);
        this.jitterMs = this.roundTripMs === null ? 0 : this.jitterMs * .75 + Math.abs(sample - this.roundTripMs) * .25;
        this.roundTripMs = this.roundTripMs === null ? sample : this.roundTripMs * .75 + sample * .25; this.changed();
      }
      return;
    }
    if (kind === 'leave') return this.fail('Tu compañero salió de la sala');
    if (kind === 'selection' && value && typeof value === 'object') {
      const selection = value as { deity: string; ready: boolean };
      if (!DEITIES.some(deity => deity.id === selection.deity)) return;
      this.remoteDeity = selection.deity; this.remoteReady = selection.ready === true;
    } else if (kind === 'start' && this.role === 'guest') {
      const config = readLanStart(value, DEITIES.map(deity => deity.id));
      if (!config) return this.fail('La configuración de la partida no es válida');
      if (!Number.isSafeInteger(packet.round) || packet.round! <= this.round) return;
      this.resetRound(packet.round!); this.config = config;
    } else if (kind === 'input' && this.role === 'host') {
      const next = readLanInput(value);
      // Los botones se acumulan hasta el siguiente paso, las direcciones toman el último estado.
      for (const key of ['attack', 'jump', 'magic', 'tapLeft', 'tapRight'] as const) next[key] ||= this.remoteInput[key];
      this.remoteInput = next; this.receivedInputAt = this.now();
      return;
    } else if (kind === 'state' && this.role === 'guest') { this.snapshot = value as ArcadeSnapshot; return; }
    else if (kind === 'loaded') { this.remoteLoaded = value === true; this.checkStartup(); }
    else if (['pause', 'blessing', 'continue', 'rematch'].includes(kind)) {
      if (this.role === 'host') this.commands.push({ kind, value });
      if (kind === 'pause') { this.paused = value === true; this.resetControls(); }
    }
    this.changed();
  }
  private async initialize() {
    if (this.transport === Wifi && !hasLocalWifi()) throw new Error('Wi-Fi local está disponible en la app Android');
    this.handles = await Promise.all([
      this.transport.addListener('message', event => this.receive(event.data)),
      this.transport.addListener('peer', event => { this.connected = event.connected === true; this.lastRemote = this.now(); this.pollConnection(); this.changed(); }),
      this.transport.addListener('closed', event => this.fail(String(event.reason ?? 'Se perdió la conexión'))),
      this.transport.addListener('suspended', () => { if (this.connected) { this.paused = true; void this.send('pause', true); this.commands.push({ kind: 'pause', value: true }); this.changed(); } }),
    ]);
    if (this.closed) { await Promise.all(this.handles.map(handle => handle.remove())); this.handles = []; throw new Error('Sala cerrada'); }
    this.heartbeat = setInterval(() => this.pollConnection(), 500);
  }
  async host() {
    await this.initialize();
    try {
      const result = await this.transport.host();
      this.invitations = result.addresses.map(address => `${address}:${result.port}#${result.token}`); this.changed();
    } catch (error) { await this.close(); throw error; }
  }
  async join(text: string) {
    const invite = readLanInvite(text);
    if (!invite) throw new Error('Pega la invitación completa que muestra el anfitrión');
    await this.initialize();
    try { await this.transport.join(invite); this.connected = true; this.changed(); }
    catch (error) { await this.close(); throw error; }
  }
  async send(kind: string, value?: unknown, round = this.round) {
    if (this.closed || !this.connected || this.error) return;
    try { await this.transport.send({ data: JSON.stringify({ version: LAN_VERSION, kind, value, round }) }); }
    catch { this.fail('Se perdió la conexión Wi-Fi'); }
  }
  select(deity: string, ready: boolean) { return this.send('selection', { deity, ready }); }
  copyInvite(text: string) { return this.transport.copy({ text }); }
  async start(config: LanStart) {
    if (this.role !== 'host' || !this.connected || !this.remoteReady || this.starting || this.config) return;
    const checked = readLanStart(config, DEITIES.map(deity => deity.id));
    if (!checked) throw new Error('Configuración inválida');
    config = checked;
    this.starting = true; this.resetRound(this.round + 1); this.config = config;
    await this.send('start', config); this.starting = false; this.changed();
  }
  private offerControls(kind: string, value: ArcadeInput | VersusInput) {
    if (this.role !== 'guest' || !this.canSimulate) return;
    const signature = JSON.stringify(value), now = this.now();
    if (signature === this.inputSignature && now - this.offeredAt < 100) return;
    this.inputSignature = signature; this.offeredAt = now;
    this.controls.offer({ kind, value, round: this.round });
  }
  input(value: ArcadeInput) { this.offerControls('input', value); }
  consumeInput() {
    if (!this.canSimulate || this.now() - this.receivedInputAt > 250) { this.remoteInput = { ...EMPTY_LAN_INPUT }; return { ...EMPTY_LAN_INPUT }; }
    const input = { ...this.remoteInput };
    for (const key of ['attack', 'jump', 'magic', 'tapLeft', 'tapRight'] as const) this.remoteInput[key] = false;
    return input;
  }
  sendVersusInput(input: VersusInput) { const next = readVersusInput(input); next.heavyTap ||= next.heavy && !this.offeredHeavy; this.offeredHeavy = next.heavy; this.offerControls('versus-input', next); }
  consumeVersusInput() { if (!this.canSimulate || this.now() - this.receivedInputAt > 250) { this.versusInput = { ...EMPTY_VERSUS_INPUT }; this.heavyEdge = false; return { ...EMPTY_VERSUS_INPUT }; } const input = { ...this.versusInput }; if (this.heavyEdge) { input.heavy = true; this.heavyEdge = false; } this.versusInput.light = this.versusInput.special = false; return input; }
  publishVersus(value: VersusState) { if (this.role === 'host' && this.connected && !this.error) this.states.offer({ kind: 'versus-state', value: compactVersus(value), round: this.round }); }
  consumeCommands() { const commands = this.commands; this.commands = []; return commands; }
  loaded(value: boolean) { if (this.localLoaded !== value) { this.localLoaded = value; void this.send('loaded', value); this.checkStartup(); this.changed(); } }
  publish(value: ArcadeSnapshot) {
    if (this.role === 'host' && this.connected && !this.error) this.states.offer({ kind: 'state', value, round: this.round });
  }
  async close() {
    if (this.closed) return;
    const leaving = this.connected ? this.send('leave') : Promise.resolve();
    this.closed = true; this.connected = false; this.states.close(); this.controls.close(); this.pings.clear();
    if (this.heartbeat) clearInterval(this.heartbeat);
    const closing = this.transport.close();
    await Promise.all([...this.handles.map(handle => handle.remove()), closing, leaving]); this.handles = [];
    this.listeners.clear();
  }
}
