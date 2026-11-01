import { readVersusInput, EMPTY_VERSUS_INPUT } from './versus';
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
type Packet = { kind: string; value?: unknown; version: number };

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
  private lastRemote = Date.now();
  private stateSending = false;
  private closed = false;
  private commands: { kind: string; value?: unknown }[] = [];
  constructor(readonly role: 'host' | 'guest', private transport: NativeWifi = Wifi) { this.player = role === 'host' ? 0 : 1; }
  static async scanInvite() { return (await Wifi.scan()).text; }
  subscribe = (callback: () => void) => { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; };
  private changed() { for (const listener of this.listeners) listener(); }
  private fail(reason: string) {
    if (this.closed) return;
    this.error = reason; this.connected = false; this.paused = true;
    this.remoteInput = { ...EMPTY_LAN_INPUT }; this.changed();
    void this.transport.close().catch(() => {});
  }
  private receive(raw: unknown) {
    if (this.closed || this.error) return;
    if (typeof raw !== 'string' || raw.length > 1024 * 1024) return this.fail('Mensaje de red inválido');
    let packet: Packet;
    try { packet = JSON.parse(raw); } catch { return this.fail('Mensaje de red inválido'); }
    if (!packet || packet.version !== LAN_VERSION) return this.fail('Ambos celulares necesitan la misma versión del juego');
    this.lastRemote = Date.now();
    const { kind, value } = packet;
    if (kind === 'versus-input' && this.role === 'host') { const next = readVersusInput(value); if (next.heavy && !this.versusInput.heavy) this.heavyEdge = true; next.light ||= this.versusInput.light; next.special ||= this.versusInput.special; this.versusInput = next; return; }
    if (kind === 'versus-state' && this.role === 'guest') { this.versusState = value as VersusState; return; }
    if (kind === 'settings' && this.role === 'guest') { this.roomSettings = readLanStart(value, DEITIES.map(deity => deity.id)); this.changed(); return; }
    if (kind === 'ping') return;
    if (kind === 'leave') return this.fail('Tu compañero salió de la sala');
    if (kind === 'selection' && value && typeof value === 'object') {
      const selection = value as { deity: string; ready: boolean };
      if (!DEITIES.some(deity => deity.id === selection.deity)) return;
      this.remoteDeity = selection.deity; this.remoteReady = selection.ready === true;
    } else if (kind === 'start' && this.role === 'guest') {
      const config = readLanStart(value, DEITIES.map(deity => deity.id));
      if (!config) return this.fail('La configuración de la partida no es válida');
      this.config = config; this.remoteLoaded = false; this.localLoaded = false;
    } else if (kind === 'input' && this.role === 'host') {
      const next = readLanInput(value);
      // Los botones se acumulan hasta el siguiente paso, las direcciones toman el último estado.
      for (const key of ['attack', 'jump', 'magic', 'tapLeft', 'tapRight'] as const) next[key] ||= this.remoteInput[key];
      this.remoteInput = next;
      return;
    } else if (kind === 'state' && this.role === 'guest') { this.snapshot = value as ArcadeSnapshot; return; }
    else if (kind === 'loaded') this.remoteLoaded = value === true;
    else if (['pause', 'blessing', 'continue', 'rematch'].includes(kind)) {
      if (this.role === 'host') this.commands.push({ kind, value });
      if (kind === 'pause') this.paused = value === true;
    }
    this.changed();
  }
  private async initialize() {
    if (this.transport === Wifi && !hasLocalWifi()) throw new Error('Wi-Fi local está disponible en la app Android');
    this.handles = await Promise.all([
      this.transport.addListener('message', event => this.receive(event.data)),
      this.transport.addListener('peer', event => { this.connected = event.connected === true; this.lastRemote = Date.now(); this.changed(); }),
      this.transport.addListener('closed', event => this.fail(String(event.reason ?? 'Se perdió la conexión'))),
      this.transport.addListener('suspended', () => { if (this.connected) { this.paused = true; void this.send('pause', true); this.commands.push({ kind: 'pause', value: true }); this.changed(); } }),
    ]);
    this.heartbeat = setInterval(() => {
      if (!this.connected) return;
      if (Date.now() - this.lastRemote > 8000) return this.fail('El compañero dejó de responder. Vuelve a crear o unirte a una sala.');
      void this.send('ping');
    }, 1000);
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
  async send(kind: string, value?: unknown) {
    if (this.closed || !this.connected) return;
    try { await this.transport.send({ data: JSON.stringify({ version: LAN_VERSION, kind, value }) }); }
    catch { this.fail('Se perdió la conexión Wi-Fi'); }
  }
  select(deity: string, ready: boolean) { return this.send('selection', { deity, ready }); }
  copyInvite(text: string) { return this.transport.copy({ text }); }
  async start(config: LanStart) {
    if (this.role !== 'host' || !this.connected || !this.remoteReady) return;
    const checked = readLanStart(config, DEITIES.map(deity => deity.id));
    if (!checked) throw new Error('Configuración inválida');
    config = checked;
    this.config = config; this.localLoaded = this.remoteLoaded = false;
    await this.send('start', config); this.changed();
  }
  input(value: ArcadeInput) { if (this.role === 'guest') void this.send('input', value); }
  consumeInput() {
    const input = { ...this.remoteInput };
    for (const key of ['attack', 'jump', 'magic', 'tapLeft', 'tapRight'] as const) this.remoteInput[key] = false;
    return input;
  }
  sendVersusInput(input: VersusInput) { if (this.role === 'guest') void this.send('versus-input', input); }
  consumeVersusInput() { const input = { ...this.versusInput }; if (this.heavyEdge) { input.heavy = true; this.heavyEdge = false; } this.versusInput.light = this.versusInput.special = false; return input; }
  publishVersus(value: VersusState) { if (this.role !== 'host' || this.stateSending) return; this.stateSending = true; void this.send('versus-state', value).finally(() => { this.stateSending = false; }); }
  consumeCommands() { const commands = this.commands; this.commands = []; return commands; }
  loaded(value: boolean) { if (this.localLoaded !== value) { this.localLoaded = value; void this.send('loaded', value); } }
  publish(value: ArcadeSnapshot) {
    if (this.role !== 'host' || this.stateSending) return;
    this.stateSending = true; void this.send('state', value).finally(() => { this.stateSending = false; });
  }
  async close() {
    if (this.closed) return;
    if (this.connected) await this.send('leave');
    this.closed = true; this.connected = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    await Promise.all(this.handles.map(handle => handle.remove())); this.handles = [];
    await this.transport.close(); this.listeners.clear();
  }
}
