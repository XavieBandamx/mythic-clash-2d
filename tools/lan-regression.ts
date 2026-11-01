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
  const monster = new Monster('grunt', LEVELS[0].skins.grunt, 500, 100, 1, 1), beast = new Beast(BEASTS.Grecia, 500, 100);
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
    host.loaded(true); guest.loaded(true); await Promise.resolve(); assert.ok(host.remoteLoaded && guest.remoteLoaded);
    guest.input({ ...EMPTY_LAN_INPUT, attack: true, right: true }); guest.input({ ...EMPTY_LAN_INPUT, right: false });
    const input = host.consumeInput(); assert.equal(input.attack, true); assert.equal(input.right, false); assert.equal(host.consumeInput().attack, false);
    await guest.send('blessing', 2); assert.deepEqual(host.consumeCommands(), [{ kind: 'blessing', value: 2 }]);
    await guest.send('state', { fake: true }); assert.equal(host.snapshot, null);
    const snapshot = new SnapshotWriter().capture(new ArcadeGame(gods, 'NORMAL')); host.publish(snapshot); await Promise.resolve(); assert.equal(guest.snapshot?.version, 1);
    await guest.send('leave'); assert.ok(host.error); assert.equal(host.paused, true);
  } finally { await guest.close(); await host.close(); }
});
console.log(`\n${passed} pruebas de sincronización LAN aprobadas.`);
