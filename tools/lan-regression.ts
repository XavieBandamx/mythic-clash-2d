import assert from 'node:assert/strict';
const storage = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  Image: class { onload: (() => void) | null = null; width = 2688; height = 984; set src(value: string) { this.onload?.(); } addEventListener() {} removeEventListener() {} },
});
const { sounds } = await import('../src/game/sound'); sounds.isMuted = true;
const { ArcadeGame, Monster, Boss, Beast, Hero } = await import('../src/arcade/engine');
const { DEITIES } = await import('../src/game/deities');
const { LEVELS, BEASTS, ORIGEN } = await import('../src/arcade/levels');
const { SnapshotWriter, SnapshotReader } = await import('../src/lan/snapshot');
const { readLanInput, readLanInvite, readLanStart, EMPTY_LAN_INPUT } = await import('../src/lan/protocol');
const { LanSession } = await import('../src/lan/session');
import type { NativeWifi } from '../src/lan/session';
const gods = DEITIES.slice(0, 2);
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const firstVersusState = (frame = 0) => ({ fighters: [{ x: 280 }, { x: 1000 }], flow: { phase: 'intro', wins: [0, 0] }, timer: 99, frame, shake: 0, cinematic: null });
let passed = 0;
async function test(name: string, run: () => void | Promise<void>) { await run(); passed++; console.log(`✓ ${name}`); }
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

await test('Invitaciones admiten solo redes privadas, puertos válidos y un secreto completo', () => {
  const token = 'a'.repeat(32);
  assert.ok(readLanInvite(`192.168.1.2:45000#${token}`)); assert.ok(readLanInvite(`10.0.0.2:45000#${token}`));
  for (const text of [`8.8.8.8:45000#${token}`, `192.168.1.999:45000#${token}`, `192.168.1.2:99999#${token}`, 'https://example.com', `192.168.1.2:4000#abc`]) assert.equal(readLanInvite(text), null);
  assert.equal(readLanInput({ attack: 'true', magic: true, arbitrary: true }).attack, false);
  assert.equal(readLanInput({ magic: true }).magic, true);
  assert.equal(readLanStart({ deities: ['inventado', gods[0].id], difficulty: 'NORMAL' }, DEITIES.map(god => god.id)), null);
});

await test('La copia remota conserva clases, identidad, monturas y referencias circulares sin enviar recursos', () => {
  const host = new ArcadeGame(gods, 'NORMAL'), guest = new ArcadeGame(gods, 'NORMAL');
  const monster = new Monster('grunt', LEVELS[0].skins.grunt, 500, 100, 1, 1), beast = new Beast(BEASTS.Grecia!, 500, 100);
  host.monsters = [monster]; host.beasts = [beast]; monster.mount = beast; beast.rider = monster; monster.target = host.heroes[1];
  host.boss = new Boss(gods[0], 800, 100, 1000, 1, 800); host.phase = 'boss'; host.heroes[1].score = 1234;
  const writer = new SnapshotWriter(), reader = new SnapshotReader(), wire = JSON.stringify(writer.capture(host));
  assert.ok(!wire.includes('.webp') && !wire.includes('imageSrc'));
  reader.apply(guest, JSON.parse(wire));
  assert.ok(guest.hero instanceof Hero && guest.boss instanceof Boss && guest.monsters[0] instanceof Monster);
  assert.equal(guest.monsters[0].mount, guest.beasts[0]); assert.equal(guest.beasts[0].rider, guest.monsters[0]);
  assert.equal(guest.monsters[0].target, guest.heroes[1]); assert.equal(guest.heroes[1].score, 1234);
  const actor = guest.hero; host.hero.x += 60; reader.apply(guest, clone(writer.capture(host)));
  assert.equal(guest.hero, actor); reader.smooth(performance.now() + 100); assert.equal(guest.hero.x, host.hero.x);
  console.log(`  Estado de ejemplo: ${(wire.length / 1024).toFixed(1)} KB`);
});

await test('Rescates, guardias, bendiciones y cambios de reino se reconstruyen en el invitado', () => {
  const host = new ArcadeGame(gods, 'NORMAL'), guest = new ArcadeGame(gods, 'NORMAL');
  const writer = new SnapshotWriter(), reader = new SnapshotReader();
  host.hero.hp = 0; host.loseLife(host.hero); reader.apply(guest, clone(writer.capture(host)));
  assert.ok(guest.rescues.has(guest.hero)); assert.equal(guest.hero.lives, host.hero.lives);
  host.hero.hp = 100; host.hero.setState('idle'); host.rescues.clear(); host.phase = 'boss'; host.boss = new Boss(gods[1], 640, 100, 1000, 1, 640); host.boss.setState('idle');
  (host as any).coopGuardCooldown = 0; (host as any).updateCoopTactics(); reader.apply(guest, clone(writer.capture(host)));
  assert.equal(guest.coopGuard?.boss, guest.boss); assert.equal(guest.boss!.coopGuarding, true);
  host.phase = 'levelClear'; (host as any).phaseTimer = 330; host.chooseRelic(0, 0); host.chooseRelic(2, 1);
  reader.apply(guest, clone(writer.capture(host))); assert.deepEqual(guest.relicChoices, [0, 2]);
  host.prepareRemoteLevel(4); reader.apply(guest, clone(writer.capture(host)));
  assert.equal(guest.levelIndex, 4); assert.equal(guest.level.title, host.level.title);
});

await test('Los estados no pueden sustituir métodos ni modificar prototipos', () => {
  const host = new ArcadeGame(gods, 'NORMAL'), guest = new ArcadeGame(gods, 'NORMAL'), reader = new SnapshotReader();
  const snapshot = clone(new SnapshotWriter().capture(host));
  snapshot.nodes.find(node => node.type === 'hero')!.fields.render = 'malicioso';
  snapshot.nodes.find(node => node.type === 'game')!.fields.step = 'malicioso';
  reader.apply(guest, snapshot); assert.equal(typeof guest.render, 'function'); assert.equal(typeof guest.hero.render, 'function'); assert.equal(typeof guest.step, 'function');
  assert.throws(() => reader.apply(guest, { ...snapshot, version: 2 } as any));
  assert.throws(() => reader.apply(guest, { ...snapshot, root: { r: -100 } }));
});

class FakeWifi implements NativeWifi {
  peer!: FakeWifi;
  callbacks = new Map<string, Set<(event: Record<string, unknown>) => void>>();
  async addListener(event: string, callback: (event: Record<string, unknown>) => void) {
    if (!this.callbacks.has(event)) this.callbacks.set(event, new Set()); this.callbacks.get(event)!.add(callback);
    return { remove: async () => { this.callbacks.get(event)?.delete(callback); } };
  }
  emit(event: string, data: Record<string, unknown>) { for (const callback of this.callbacks.get(event) ?? []) callback(data); }
  async host() { return { addresses: ['192.168.1.2'], port: 4000, token: 'a'.repeat(32) }; }
  async join() { this.emit('peer', { connected: true }); this.peer.emit('peer', { connected: true }); }
  async send(message: { data: string }) { this.peer.emit('message', { data: message.data }); }
  async close() {}
  async copy() {}
  async scan() { return {}; }
}
await test('Sala enlaza personajes, controles, carga y comandos sin permitir que el invitado simule al anfitrión', async () => {
  const a = new FakeWifi(), b = new FakeWifi(); a.peer = b; b.peer = a;
  const host = new LanSession('host', a), guest = new LanSession('guest', b);
  try {
    await host.host(); await guest.join(host.invitations[0]);
    await host.select(gods[0].id, true); await guest.select(gods[1].id, true);
    assert.equal(host.remoteDeity, gods[1].id); assert.equal(guest.remoteDeity, gods[0].id);
    await host.start({ deities: [gods[0].id, gods[1].id], difficulty: 'NORMAL' }); assert.deepEqual(guest.config, host.config);
    host.publish(new SnapshotWriter().capture(new ArcadeGame(gods, 'NORMAL'))); guest.acknowledgeState();
    host.loaded(true); guest.loaded(true); await Promise.resolve(); assert.ok(host.remoteLoaded && guest.remoteLoaded);
    guest.input({ ...EMPTY_LAN_INPUT, attack: true, right: true }); guest.input({ ...EMPTY_LAN_INPUT, right: false });
    await settle();
    const input = host.consumeInput(); assert.equal(input.attack, true); assert.equal(input.right, false); assert.equal(host.consumeInput().attack, false);
    await guest.send('blessing', 2); assert.deepEqual(host.consumeCommands(), [{ kind: 'blessing', value: 2, player: 1 }]);
    await guest.send('state', { fake: true }); assert.equal(host.snapshot, null);
    const snapshot = new SnapshotWriter().capture(new ArcadeGame(gods, 'NORMAL')); host.publish(snapshot); await settle(); assert.equal(guest.snapshot?.version, 1);
    await guest.send('leave'); assert.ok(host.error); assert.equal(host.paused, true);
  } finally { await guest.close(); await host.close(); }
});
await test('Versus conserva toques breves, carga fuerte, marcador y autoridad del anfitrión', async () => {
  const a = new FakeWifi(), b = new FakeWifi(); a.peer = b; b.peer = a;
  const host = new LanSession('host', a), guest = new LanSession('guest', b);
  try {
    await host.host(); await guest.join(host.invitations[0]); await guest.select(gods[1].id, true);
    await host.start({ deities: [gods[0].id, gods[1].id], difficulty: 'NORMAL', mode: 'versus', arena: 3 });
    host.publishVersus(firstVersusState()); guest.acknowledgeState(); host.loaded(true); guest.loaded(true); await settle();
    assert.equal(guest.config?.mode, 'versus'); assert.equal(guest.config?.arena, 3);
    guest.sendVersusInput({ left: false, right: false, up: false, down: false, light: true, heavy: true, special: true });
    guest.sendVersusInput({ left: true, right: false, up: false, down: false, light: false, heavy: false, special: false });
    await settle();
    const input = host.consumeVersusInput(); assert.ok(input.left && input.light && input.heavy && input.special);
    const next = host.consumeVersusInput(); assert.ok(next.left && !next.light && !next.heavy && !next.special);
    await guest.send('versus-state', { fake: true }); assert.equal(host.versusState, null);
    await guest.send('pause', true); assert.equal(host.paused, true); await host.send('pause', false); assert.equal(guest.paused, false);
    await guest.send('rematch'); assert.ok(host.consumeCommands().some(command => command.kind === 'rematch'));
  } finally { await guest.close(); await host.close(); }
});
await test('El anfitrión espera recursos y confirmación del primer estado antes de avanzar', async () => {
  const a = new FakeWifi(), b = new FakeWifi(); a.peer = b; b.peer = a;
  const host = new LanSession('host', a), guest = new LanSession('guest', b);
  try {
    await host.host(); await guest.join(host.invitations[0]); await guest.select(gods[1].id, true);
    await host.start({ deities: [gods[0].id, gods[1].id], difficulty: 'NORMAL', mode: 'versus' });
    host.loaded(true); guest.loaded(true); await settle(); assert.ok(!host.canSimulate && !guest.canSimulate);
    host.publishVersus(firstVersusState()); await settle(); assert.ok(!host.canSimulate && !guest.canSimulate); guest.acknowledgeState(); await settle(); assert.ok(host.canSimulate && guest.canSimulate);
    guest.loaded(false); assert.ok(!host.canSimulate && !guest.canSimulate); guest.loaded(true); assert.ok(host.canSimulate && guest.canSimulate);
  } finally { await guest.close(); await host.close(); }
});

class SlowWifi extends FakeWifi {
  hold = false;
  sent: string[] = [];
  waiting: { message: { data: string }; resolve: () => void }[] = [];
  async send(message: { data: string }) {
    this.sent.push(message.data);
    if (!this.hold) return super.send(message);
    await new Promise<void>(resolve => this.waiting.push({ message, resolve }));
  }
  flush() { const next = this.waiting.shift(); if (next) { this.peer.emit('message', { data: next.message.data }); next.resolve(); } }
}
await test('Una red lenta conserva solo el estado más reciente y no crea una cola de cuadros', async () => {
  const a = new SlowWifi(), b = new SlowWifi(); a.peer = b; b.peer = a;
  const host = new LanSession('host', a), guest = new LanSession('guest', b);
  try {
    await host.host(); await guest.join(host.invitations[0]); await guest.select(gods[1].id, true);
    await host.start({ deities: [gods[0].id, gods[1].id], difficulty: 'NORMAL', mode: 'versus' });
    host.publishVersus(firstVersusState()); guest.acknowledgeState(); host.loaded(true); guest.loaded(true); await settle();
    a.hold = true;
    for (let frame = 1; frame <= 100; frame++) host.publishVersus(firstVersusState(frame));
    assert.equal(a.waiting.length, 1); a.flush(); await settle(); assert.equal(a.waiting.length, 1); assert.equal(guest.versusState?.frame, 1);
    a.flush(); await settle(); assert.equal(a.waiting.length, 0); assert.equal(guest.versusState?.frame, 100);
  } finally { a.hold = b.hold = false; await guest.close(); await host.close(); }
});
await test('Controles lentos conservan ataque, súper y toque fuerte sin repetirlos ni dejar movimiento pegado', async () => {
  let now = 1000;
  const a = new SlowWifi(), b = new SlowWifi(); a.peer = b; b.peer = a;
  const host = new LanSession('host', a, () => now), guest = new LanSession('guest', b, () => now);
  try {
    await host.host(); await guest.join(host.invitations[0]); await guest.select(gods[1].id, true);
    await host.start({ deities: [gods[0].id, gods[1].id], difficulty: 'NORMAL', mode: 'versus' });
    host.publishVersus(firstVersusState()); guest.acknowledgeState(); host.loaded(true); guest.loaded(true); await settle(); b.hold = true;
    const neutral = { left: false, right: false, up: false, down: false, light: false, heavy: false, special: false };
    guest.sendVersusInput(neutral);
    guest.sendVersusInput({ ...neutral, light: true }); guest.sendVersusInput({ ...neutral, heavy: true, special: true }); guest.sendVersusInput(neutral);
    assert.equal(b.waiting.length, 1); b.flush(); await settle(); b.flush(); await settle();
    const input = host.consumeVersusInput(); assert.ok(input.light && input.heavy && input.special && !input.left);
    const next = host.consumeVersusInput(); assert.ok(!next.light && !next.heavy && !next.special);
    b.hold = false; guest.sendVersusInput({ ...neutral, right: true }); await settle(); assert.equal(host.consumeVersusInput().right, true);
    now += 251; assert.equal(host.consumeVersusInput().right, false);
    const before = b.sent.length; guest.sendVersusInput(neutral); await settle();
    for (let i = 0; i < 100; i++) guest.sendVersusInput(neutral); await settle(); assert.equal(b.sent.length, before + 1);
  } finally { a.hold = b.hold = false; await guest.close(); await host.close(); }
});
await test('La revancha descarta estados, controles y carga pertenecientes al combate anterior', async () => {
  const a = new SlowWifi(), b = new SlowWifi(); a.peer = b; b.peer = a;
  const host = new LanSession('host', a), guest = new LanSession('guest', b);
  try {
    await host.host(); await guest.join(host.invitations[0]); await guest.select(gods[1].id, true);
    await host.start({ deities: [gods[0].id, gods[1].id], difficulty: 'NORMAL', mode: 'versus' });
    host.publishVersus(firstVersusState(500)); guest.acknowledgeState(); host.loaded(true); guest.loaded(true); await settle();
    const old = a.sent.find(data => JSON.parse(data).kind === 'versus-state')!;
    host.prepareRematch(); await settle(); assert.equal(guest.round, 2); assert.ok(!guest.ready && !host.ready);
    b.emit('message', { data: old }); assert.equal(guest.versusState, null);
    host.loaded(true); guest.loaded(true); await settle(); assert.ok(!host.canSimulate);
    host.publishVersus(firstVersusState()); await settle(); assert.ok(!host.canSimulate && !guest.canSimulate); guest.acknowledgeState(); await settle(); assert.ok(host.canSimulate && guest.canSimulate); assert.equal((guest.versusState as import('../src/lan/versus').VersusState | null)?.frame, 0);
  } finally { await guest.close(); await host.close(); }
});
await test('La carga tolera demoras, la conexión mide ida y vuelta y una ausencia real sí se detecta', async () => {
  let now = 1000;
  const a = new FakeWifi(), b = new FakeWifi(); a.peer = b; b.peer = a;
  const host = new LanSession('host', a, () => now), guest = new LanSession('guest', b, () => now);
  try {
    await host.host(); await guest.join(host.invitations[0]);
    now += 20000; host.pollConnection(); await settle(); assert.equal(host.error, ''); assert.equal(host.roundTripMs, 0);
    now += 61000; host.pollConnection(); assert.ok(host.error); assert.equal(host.connected, false);
  } finally { await guest.close(); await host.close(); }
});
await test('Wi-Fi acepta Asgard y los cuatro nuevos luchadores, y reconstruye el quinto reino y el final', async () => {
  const { ARENAS } = await import('../src/game/arenas');
  const { createRoute } = await import('../src/arcade/run');
  for (let arena = 0; arena < ARENAS.length; arena++) assert.ok(readLanStart({ deities: ['kali', 'amaterasu'], difficulty: 'NORMAL', mode: 'versus', arena }, DEITIES.map(deity => deity.id)));
  const asgard = ARENAS.findIndex(arena => arena.pantheon === 'Nórdico'); assert.ok(asgard >= 0);
  assert.equal(readLanStart({ deities: ['odin', 'thor'], difficulty: 'NORMAL', mode: 'versus', arena: ARENAS.length }, DEITIES.map(deity => deity.id)), null);
  for (const ids of [['odin', 'thor'], ['loki', 'sunwukong'], ['kali', 'amaterasu']] as [string, string][]) {
    const a = new FakeWifi(), b = new FakeWifi(); a.peer = b; b.peer = a;
    const host = new LanSession('host', a), guest = new LanSession('guest', b);
    try {
      await host.host(); await guest.join(host.invitations[0]); await guest.select(ids[1], true);
      const route = createRoute(ids, Math.random, false);
      await host.start({ deities: ids, difficulty: 'NORMAL', mode: 'arcade', arena: asgard, route });
      assert.equal(guest.config?.route?.length, 5); assert.equal(guest.config?.arena, asgard); assert.deepEqual(guest.config?.deities, ids);
      const team = ids.map(id => DEITIES.find(deity => deity.id === id)!);
      const source = new ArcadeGame(team, 'NORMAL', { route }), target = new ArcadeGame(team, 'NORMAL', { route });
      const writer = new SnapshotWriter(), reader = new SnapshotReader();
      for (let stage = 0; stage <= LEVELS.length; stage++) {
        source.prepareRemoteLevel(stage); host.publish(writer.capture(source)); await settle();
        reader.apply(target, clone(guest.snapshot!)); guest.acknowledgeState();
        assert.equal(target.level.title, source.level.title); assert.equal(target.levelIndex, stage); assert.deepEqual(target.heroes.map(hero => hero.deity.id), ids);
      }
      host.loaded(true); guest.loaded(true); await settle(); assert.ok(host.canSimulate && guest.canSimulate);
    } finally { await guest.close(); await host.close(); }
  }
});
await test('Cuatro dispositivos esperan a todos, separan controles y bendiciones y sincronizan ambos modos', async () => {
  class PartyWifi extends FakeWifi {
    slot = 0; hub!: PartyWifi; clients: PartyWifi[] = [];
    async join() { this.slot = this.hub.clients.length + 1; this.hub.clients.push(this); this.emit('peer', { connected: true, player: this.slot }); this.hub.emit('peer', { connected: true, player: this.slot }); }
    async send(message: { data: string; target?: number }) {
      if (this.hub) this.hub.emit('message', { data: message.data, player: this.slot });
      else for (const client of this.clients) if (!message.target || message.target === client.slot) client.emit('message', { data: message.data });
    }
  }
  for (const mode of ['arcade', 'survival'] as const) {
    const a = new PartyWifi(), clients = [new PartyWifi(), new PartyWifi(), new PartyWifi()]; clients.forEach(client => client.hub = a);
    const host = new LanSession('host', a), guests = clients.map(client => new LanSession('guest', client));
    const ids = ['kali', 'odin', 'amaterasu', 'sunwukong'];
    try {
      await host.host(); for (const guest of guests) await guest.join(host.invitations[0]);
      await host.select(ids[0], true); for (let i=0;i<3;i++) await guests[i].select(ids[i+1], true); await settle();
      assert.deepEqual(guests.map(guest=>guest.player), [1,2,3]); assert.equal(host.members.length,3); assert.ok(host.remoteReady);
      const { createRoute } = await import('../src/arcade/run'); const route = createRoute(ids, Math.random, false);
      await host.start({ deities: ids, difficulty: 'NORMAL', mode, route });
      host.loaded(true); guests.forEach(guest=>guest.loaded(true));
      const team=ids.map(id=>DEITIES.find(deity=>deity.id===id)!); const game=new ArcadeGame(team,'NORMAL',{kind:mode,route});
      host.publish(new SnapshotWriter().capture(game)); await settle();
      for(let i=0;i<3;i++) { const copy=new ArcadeGame(team,'NORMAL',{kind:mode,route}); new SnapshotReader().apply(copy,clone(guests[i].snapshot!)); assert.equal(copy.heroes.length,4); if(i<2) guests[i].acknowledgeState(); }
      await settle(); assert.ok(!host.canSimulate); guests[2].acknowledgeState(); await settle(); assert.ok(host.canSimulate && guests.every(guest=>guest.canSimulate));
      guests[0].input({...EMPTY_LAN_INPUT,left:true,attack:true}); guests[1].input({...EMPTY_LAN_INPUT,right:true,magic:true}); guests[2].input({...EMPTY_LAN_INPUT,jump:true}); await settle();
      assert.ok(host.consumeInput(1).attack); assert.ok(host.consumeInput(2).magic); assert.ok(host.consumeInput(3).jump); assert.ok(!host.consumeInput(1).attack);
      await guests[2].send('blessing',2); assert.deepEqual(host.consumeCommands(),[{kind:'blessing',value:2,player:3}]);
      await guests[1].send('pause',true); await settle(); assert.ok(host.paused && guests.every(guest=>guest.paused));
    } finally { await Promise.all([host,...guests].map(room=>room.close())); }
  }
});
console.log(`\n${passed} pruebas de sincronización LAN aprobadas.`);
