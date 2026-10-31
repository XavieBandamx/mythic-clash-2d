import assert from 'node:assert/strict';

const storage = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  Image: class {
    onload: (() => void) | null = null;
    width = 2688; height = 984;
    set src(_value: string) { this.onload?.(); }
    addEventListener() {} removeEventListener() {}
  }
});
const { sounds } = await import('../src/game/sound');
sounds.isMuted = true;
const { Fighter } = await import('../src/App');
const { DEITIES } = await import('../src/game/deities');
const { ArcadeGame, Boss, Monster, Beast } = await import('../src/arcade/engine');
const { LEVELS, BEASTS, buildWaves } = await import('../src/arcade/levels');
const { readMastery, awardMastery } = await import('../src/game/progression');
const { MatchFlow, ROUND_INTRO_TICKS, ROUND_KO_TICKS, VERSUS_HEALTH } = await import('../src/game/match');
const { moveRoster, ROSTER_PAGE_SIZE } = await import('../src/game/roster');
const { LIFE_LOSS_TICKS } = await import('../src/arcade/engine');
const god = (id: string) => DEITIES.find(d => d.id === id)!;
const fighter = (id = 'zeus') => new Fighter(1, god(id), false, 300, 1);
const opponent = fighter('hades'); opponent.x = 900;
const step = (f: InstanceType<typeof Fighter>, n = 1) => { for (let i = 0; i < n; i++) f.update(1280, opponent, 'NORMAL', []); };
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }

test('Ataques no se cancelan con guardia ni salto', () => {
  const f = fighter(); f.executeHeavyAttack(); f.crouchOrBlock(true); f.jump();
  assert.equal(f.state, 'ATTACK_HEAVY'); assert.equal(f.isGrounded, true); assert.equal(f.isBlocking, false);
});
test('Recuperación completa al fallar y buffer tardío', () => {
  const f = fighter(); f.executeLightAttack(); step(f, 5); f.executeHeavyAttack(); step(f, 10);
  assert.equal(f.state, 'ATTACK_LIGHT'); // El buffer temprano caduca: no se almacena indefinidamente.
  step(f, 2); f.executeHeavyAttack(); step(f, 4);
  assert.equal(f.state, 'ATTACK_HEAVY');
});
test('Confirmación de ligero permite enlazar fuerte', () => {
  const f = fighter(); f.executeLightAttack(); step(f, 6); f.attackConnected = true;
  f.executeHeavyAttack(); step(f, 3); assert.equal(f.state, 'ATTACK_HEAVY'); assert.equal(f.chainStep, 1);
});
test('Bloqueo preciso tiene ventana, consumo y cooldown', () => {
  const f = fighter('anubis'), a = fighter('zeus'); f.crouchOrBlock(true);
  assert.equal(f.tryPerfectGuard(a, 20), true); assert.equal(a.state, 'HITSTUN'); assert.equal(f.hp, 100);
  assert.equal(f.tryPerfectGuard(a, 20), false);
  f.crouchOrBlock(false); f.crouchOrBlock(true); assert.equal(f.tryPerfectGuard(a, 20), false);
  step(f, 46); f.crouchOrBlock(false); f.crouchOrBlock(true); assert.equal(f.tryPerfectGuard(a, 20), true);
});
test('Bloqueo tardío no activa contraataque', () => {
  const f = fighter(); f.crouchOrBlock(true); step(f, 8); assert.equal(f.tryPerfectGuard(opponent, 20), false);
});
test('Reflejo de bloqueo preciso depende del timing', () => {
  const f = fighter('mictlantecuhtli'), a = fighter(); f.crouchOrBlock(true); f.tryPerfectGuard(a, 20); assert.equal(a.hp, 90);
});
test('Carga fuerte y toque corto tienen comportamientos distintos', () => {
  const f = fighter(); for (let i = 0; i < 25; i++) f.holdHeavy(true); f.releaseHeavyInput();
  assert.equal(f.chargedHeavy, true); assert.equal(f.state, 'ATTACK_HEAVY');
  const tap = fighter(); tap.releaseHeavyInput(); assert.equal(tap.state, 'ATTACK_HEAVY'); assert.equal(tap.chargedHeavy, false);
});
test('No se pierde un fuerte anticipado durante ligero', () => {
  const f = fighter(); f.executeLightAttack(); step(f, 7); f.attackConnected = true;
  f.holdHeavy(true); f.releaseHeavyInput(); step(f, 2); assert.equal(f.state, 'ATTACK_HEAVY');
});
test('Los perfiles cambian alcance y tiempo de preparación', () => {
  const a = fighter('anubis'), p = fighter('poseidon'); a.executeHeavyAttack(); p.executeHeavyAttack();
  step(a, 7); step(p, 7); assert.ok(a.getHitbox()); assert.equal(p.getHitbox(), null);
  step(p, 6); assert.ok(p.getHitbox()!.w > a.getHitbox()!.w);
});
const idle = { left: false, right: false, up: false, down: false, attack: false, jump: false, magic: false, tapLeft: false, tapRight: false };
test('Versus requiere dos rondas y preserva el marcador entre ellas', () => {
  const flow = new MatchFlow();
  assert.ok(VERSUS_HEALTH > 100);
  assert.equal(flow.finish(1), false);
  for (let i = 0; i < ROUND_INTRO_TICKS; i++) flow.step();
  assert.equal(flow.phase, 'fight'); assert.equal(flow.finish(1), true); assert.equal(flow.finish(1), false);
  for (let i = 0; i < ROUND_KO_TICKS; i++) flow.step();
  assert.equal(flow.phase, 'intro'); assert.equal(flow.round, 2); assert.deepEqual(flow.wins, [1, 0]);
  for (let i = 0; i < ROUND_INTRO_TICKS; i++) flow.step();
  flow.finish(1);
  for (let i = 0; i < ROUND_KO_TICKS; i++) flow.step();
  assert.equal(flow.phase, 'complete'); assert.deepEqual(flow.wins, [2, 0]);
});
test('Empates no entregan victoria y la torre mantiene un solo enfrentamiento', () => {
  const draw = new MatchFlow();
  for (let i = 0; i < ROUND_INTRO_TICKS; i++) draw.step();
  draw.finish(null, 'time');
  for (let i = 0; i < ROUND_KO_TICKS; i++) draw.step();
  assert.deepEqual(draw.wins, [0, 0]); assert.equal(draw.phase, 'intro');
  const tower = new MatchFlow(1);
  for (let i = 0; i < ROUND_INTRO_TICKS; i++) tower.step();
  tower.finish(2);
  for (let i = 0; i < ROUND_KO_TICKS; i++) tower.step();
  assert.equal(tower.phase, 'complete');
});
test('El selector admite más personajes que una página y filas incompletas', () => {
  for (const count of [1, 12, 19, 37, 60]) for (let index = 0; index < count; index++) {
    for (const direction of ['left', 'right', 'up', 'down'] as const) {
      const next = moveRoster(index, direction, count); assert.ok(next >= 0 && next < count);
    }
  }
  assert.equal(moveRoster(17, 'right', 37), ROSTER_PAGE_SIZE);
  assert.equal(moveRoster(36, 'down', 37), 0);
});
test('Perder una vida pausa el mundo y no reaparece antes de mostrar la caída', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); g.hero.hp = 0; g.hero.setState('down'); g.hero.stateTimer = 39;
  g.step(idle); assert.equal(g.hero.lives, 2); assert.equal(g.hero.hp, 0); assert.ok(g.lifeLoss);
  const tick = g.tick; g.loseLife(g.hero); assert.equal(g.hero.deaths, 1);
  for (let i = 0; i < LIFE_LOSS_TICKS - 1; i++) g.step({ ...idle, attack: true, magic: true });
  assert.equal(g.tick, tick); assert.equal(g.hero.hp, 0); assert.equal(g.hero.lives, 2);
  g.step(idle); assert.equal(g.lifeLoss, null); assert.equal(g.hero.hp, g.hero.maxHp); assert.ok(g.hero.invuln > 0);
});
test('Última vida muestra la caída antes de abrir el continue', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); g.hero.lives = 1; g.hero.hp = 0;
  g.loseLife(g.hero); assert.equal(g.phase, 'play');
  for (let i = 0; i < LIFE_LOSS_TICKS; i++) g.step(idle);
  assert.equal(g.phase, 'gameOver'); assert.equal(g.continueTimer, 600);
  g.continueGame(); assert.equal(g.hero.lives, 3); assert.equal(g.hero.hp, g.hero.maxHp);
});
test('Dos caídas cooperativas se procesan sin duplicar vidas perdidas', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL');
  for (const h of g.heroes) { h.hp = 0; g.loseLife(h); }
  for (let i = 0; i < LIFE_LOSS_TICKS * 2; i++) g.step(idle);
  assert.equal(g.lifeLoss, null); assert.deepEqual(g.heroes.map(h => h.deaths), [1, 1]);
  assert.deepEqual(g.heroes.map(h => h.lives), [2, 2]); assert.ok(g.heroes.every(h => h.hp === h.maxHp));
});
test('Renacer de Osiris no gasta una vida ni activa la secuencia de derrota', () => {
  const g = new ArcadeGame(god('osiris'), 'NORMAL'); g.hero.hp = 0; g.hero.setState('down'); g.hero.stateTimer = 39;
  g.step(idle); assert.ok(g.hero.hp > 0); assert.equal(g.lifeLoss, null); assert.equal(g.hero.lives, 3);
});
test('Vasijas se rompen una vez y entregan su objeto', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); const prop = g.scenery[0];
  g.hero.x = prop.x - 30; g.hero.z = prop.z;
  const strike = { front: 100, back: 10, damage: 10, knockdown: false, heavy: false };
  g.heroStrike(g.hero, strike); g.heroStrike(g.hero, strike);
  assert.equal(prop.broken, true); assert.equal(g.items.length, 1); assert.equal(g.hero.score, 100);
});
test('Peligros se anuncian y dañan a héroes y enemigos al estallar', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); const h = g.hazards[0];
  g.camX = 0; h.x = 400; h.clock = 238; g.hero.x = 400; g.hero.z = h.z; g.hero.invuln = 0;
  const m = new Monster('grunt', LEVELS[0].skins.grunt, 405, h.z, 1, 1); g.monsters.push(m);
  (g as any).updateEnvironment(); assert.equal(g.hero.hp, 100);
  (g as any).updateEnvironment(); assert.ok(g.hero.hp < 100); assert.ok(m.hp < m.maxHp);
});
test('Saltos permiten evitar el peligro del suelo', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); const h = g.hazards[0]; h.x = 400; h.clock = 239;
  g.hero.x = 400; g.hero.z = h.z; g.hero.y = 80; g.hero.invuln = 0;
  (g as any).updateEnvironment(); assert.equal(g.hero.hp, 100);
});
test('Bendiciones se eligen una vez y el nivel avanza', () => {
  const g = new ArcadeGame([god('zeus'), god('anubis')], 'NORMAL'); g.phase = 'levelClear'; (g as any).phaseTimer = 330;
  g.chooseRelic(2); assert.equal(g.relicChoice, 2); assert.equal(g.heroes[1].blessing, 'arcana');
  const magic = g.hero.magic; g.chooseRelic(2); assert.equal(g.hero.magic, magic);
  for (let i = 0; i < 85; i++) g.step(idle);
  assert.equal(g.levelIndex, 1); assert.equal(g.relicChoice, null); assert.equal(g.hero.blessing, 'arcana');
});
test('Jefes escapan al umbral y respetan cooldown', () => {
  const b = new Boss(god('hades'), 600, 80, 400, 1, 600); b.setState('idle'); b.iq = 1;
  for (let i = 0; i < 5; i++) { b.invuln = 0; b.receiveHit({ damage: 1, heavy: false, knockdown: false, dir: 1 }); }
  assert.equal((b as any).escapePending, true);
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); (b as any).escape(g, g.hero);
  for (let i = 0; i < 6; i++) { b.invuln = 0; b.receiveHit({ damage: 1, heavy: false, knockdown: false, dir: 1 }); }
  assert.equal((b as any).escapePending, false);
});
test('Bendiciones se pueden elegir con los controles de juego', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); g.phase = 'levelClear'; (g as any).phaseTimer = 330;
  g.step({ ...idle, tapRight: true }); assert.equal(g.relicCursor, 1);
  g.step({ ...idle, attack: true }); assert.equal(g.relicChoice, 1);
});
test('Giro de Anubis tiene evasión gratuita con cooldown', () => {
  const g = new ArcadeGame(god('anubis'), 'NORMAL'); (g.hero as any).startSpin(); assert.equal(g.hero.hp, 100);
  (g.hero as any).startSpin(); assert.equal(g.hero.hp, 96);
});
test('Reflejo que desmonta a un enemigo no cierra la partida', () => {
  const g = new ArcadeGame(god('mictlantecuhtli'), 'NORMAL');
  const m = new Monster('grunt', LEVELS[0].skins.grunt, 300, g.hero.z, 1, 1);
  const beast = new Beast(BEASTS.Grecia, m.x, m.z);
  m.mount = beast; beast.rider = m; m.hp = 1; m.facing = -1; m.setState('strike'); m.stateTimer = 3;
  g.hero.x = 260; g.hero.invuln = 0;
  assert.doesNotThrow(() => m.update(g));
  assert.equal(m.mount, null);
});
test('Súper no se consume ni se anuncia durante recuperación', () => {
  const f = fighter(); f.superMeter = 100; f.executeHeavyAttack();
  assert.equal(f.executeSpecial(opponent), false); assert.equal(f.superMeter, 100);
});
test('Maestría conserva mejor combo y rango sin perder progreso', () => {
  awardMastery('zeus', { wins: 1, bestCombo: 8, bestRank: 'A' });
  awardMastery('zeus', { clears: 1, bestCombo: 3, bestRank: 'C' });
  assert.deepEqual(readMastery('zeus'), { wins: 1, clears: 1, bestCombo: 8, bestRank: 'A' });
});
test('Todos los reinos tienen composiciones y posiciones válidas', () => {
  for (let level = 0; level < 4; level++) {
    const waves = buildWaves(level); assert.equal(waves.length, 4);
    assert.ok(waves[2].spawns.some(s => s.kind === 'mini'));
    assert.ok(waves.every(w => w.spawns.every(s => s.zFrac >= 0 && s.zFrac <= 1)));
  }
  assert.notDeepEqual(buildWaves(0), buildWaves(1));
});
console.log(`\n${passed} pruebas de regresión aprobadas.`);

// Recorridos prolongados con un controlador simple: comprueba estados, recursos y avance.
if (process.env.MYTHIC_SOAK === '1') {
  let seed = 20261031;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const deity of DEITIES) {
    const g = new ArcadeGame(deity, 'NORMAL');
    let continues = 0;
    for (let tick = 0; tick < 54000 && g.phase !== 'victory' && g.phase !== 'finalOver'; tick++) {
      if (g.phase === 'gameOver') { g.continueGame(); continues++; }
      if (g.relicOfferReady) g.chooseRelic(1);
      const h = g.hero;
      const targets = [...g.monsters.filter(m => m.kind !== 'thief' && !m.isDown), ...(g.boss && !g.boss.isDown ? [g.boss] : [])];
      const target = targets.sort((a, b) => (Math.abs(a.x - h.x) + Math.abs(a.z - h.z) * 2) - (Math.abs(b.x - h.x) + Math.abs(b.z - h.z) * 2))[0];
      const dx = target ? target.x - h.x : 500;
      const dz = target ? target.z - h.z : 0;
      const facingTarget = !target || (dx >= 0 ? 1 : -1) === h.facing;
      const input = { ...idle, left: dx < -70 || (!facingTarget && dx < 0), right: dx > 70 || (!facingTarget && dx >= 0), up: dz < -8, down: dz > 8,
        attack: !!target && Math.abs(dx) < 170 && facingTarget && tick % 7 === 0, magic: !!g.boss && h.magic > 0 && tick % 120 === 0,
        jump: tick % 91 === 0 && !!target && Math.abs(dx) < 170 };
      g.step(input);
      assert.ok(Number.isFinite(h.hp) && Number.isFinite(h.x) && Number.isFinite(h.z));
      assert.ok(h.hp >= 0 && h.hp <= h.maxHp && h.magic >= 0 && h.magic <= 6);
    }
    console.log(`Recorrido ${deity.name}: nivel ${g.levelIndex + 1}, ${g.phase}, ${continues} continues`);
    if (g.levelIndex === 0) console.log({ hero: { x: g.hero.x, z: g.hero.z, state: g.hero.state, hp: g.hero.hp }, cam: g.camX, monsters: g.monsters.map(m => ({ kind: m.kind, x: m.x, z: m.z, hp: m.hp, state: m.state })), boss: g.boss && { state: g.boss.state, hp: g.boss.hp }, wave: (g as any).waveIndex });
    assert.ok(g.levelIndex > 0, `${deity.name} no avanzó del primer reino`);
  }
}
