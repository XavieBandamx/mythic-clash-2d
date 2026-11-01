import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const storage = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) },
  Image: class {
    onload: (() => void) | null = null;
    private imageSrc = '';
    width = 2688; height = 984;
    set src(value: string) { this.imageSrc = value; this.onload?.(); }
    get src() { return this.imageSrc; }
    addEventListener() {} removeEventListener() {}
  }
});
const { sounds } = await import('../src/game/sound');
sounds.isMuted = true;
const { Fighter, CanvasFighter, OrigenFighter } = await import('../src/App');
const { DEITIES } = await import('../src/game/deities');
const { ArcadeGame, Boss, Monster, Beast } = await import('../src/arcade/engine');
const { LEVELS, BEASTS, MONSTER_SPRITES, buildWaves, ORIGEN } = await import('../src/arcade/levels');
const { readMastery, awardMastery } = await import('../src/game/progression');
const { MatchFlow, ROUND_INTRO_TICKS, ROUND_KO_TICKS, VERSUS_HEALTH } = await import('../src/game/match');
const { moveRoster, ROSTER_PAGE_SIZE } = await import('../src/game/roster');
const { LIFE_LOSS_TICKS, RESCUE_WINDOW_TICKS, RESCUE_HOLD_TICKS, COOP_LINK_WINDOW, COOP_GUARD_TICKS } = await import('../src/arcade/engine');
const { getSpriteSheetConfig, getExtraSheetConfig, loadSpriteSheet, spriteAssetSrc, EXTRA_ROWS } = await import('../src/game/sprites');
const { victoryFrame, jumpFrame, castFrame } = await import('../src/game/spriteMotion');
const god = (id: string) => DEITIES.find(d => d.id === id)!;
const fighter = (id = 'zeus') => new Fighter(1, god(id), false, 300, 1);
const opponent = fighter('hades'); opponent.x = 900;
const step = (f: InstanceType<typeof Fighter>, n = 1) => { for (let i = 0; i < n; i++) f.update(1280, opponent, 'NORMAL', []); };
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }

function webpSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  for (let offset = 12; offset + 8 < bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4), data = offset + 8;
    if (type === 'VP8X') return [bytes.readUIntLE(data + 4, 3) + 1, bytes.readUIntLE(data + 7, 3) + 1];
    if (type === 'VP8 ') return [bytes.readUInt16LE(data + 6) & 0x3fff, bytes.readUInt16LE(data + 8) & 0x3fff];
    if (type === 'VP8L') { const packed = bytes.readUInt32LE(data + 1); return [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1]; }
    const length = bytes.readUInt32LE(offset + 4); offset = data + length + (length % 2);
  }
  throw new Error(`Dimensiones WebP desconocidas: ${path}`);
}

test('Las hojas principales y extra de cada dios coinciden con su cuadrícula 4×4', () => {
  for (const deity of [...DEITIES, ORIGEN]) {
    for (const cfg of [getSpriteSheetConfig(deity), getExtraSheetConfig(deity)]) {
      assert.ok(cfg, `Falta la hoja extra de ${deity.id}`);
      assert.deepEqual(webpSize(`.${cfg.src}`), [cfg.frameWidth * 4, cfg.frameHeight * 4], cfg.src);
    }
  }
});
test('El inventario compartido contiene solo las hojas usadas por el juego', () => {
  const ids = [...DEITIES, ORIGEN].flatMap(d => [d.id, `${d.id}-extra`]);
  ids.push(...Object.keys(MONSTER_SPRITES), ...Object.values(BEASTS).map(b => b.id));
  assert.equal(new Set(ids).size, ids.length, 'No debe haber IDs de sprite duplicados');
  assert.deepEqual(readdirSync('assets/sprites').sort(), ids.map(id => `${id}.webp`).sort());
  for (const [id, meta] of Object.entries(MONSTER_SPRITES)) {
    assert.deepEqual(webpSize(`.${spriteAssetSrc(id)}`), [meta.frameWidth * 4, meta.frameHeight * 4]);
  }
  for (const beast of Object.values(BEASTS)) {
    assert.deepEqual(webpSize(`.${spriteAssetSrc(beast.id)}`), [beast.frameWidth * 4, beast.frameHeight * 4]);
  }
});
test('La pose fuerte coincide con el primer tick activo de cada dios', () => {
  for (const deity of [...DEITIES, ORIGEN]) {
    const f = new CanvasFighter(1, deity, false, 300, 1); f.executeHeavyAttack();
    f.animTimer = Math.ceil(f.heavyImpactTick) - 1;
    assert.equal((f as any).extraPose().frame, 0); assert.equal(f.getHitbox(), null);
    f.animTimer++; assert.equal((f as any).extraPose().frame, 1); assert.ok(f.getHitbox());
  }
});
test('Salto y aterrizaje usan los cuatro cuadros sin quedarse en pose aérea', () => {
  assert.deepEqual([jumpFrame(1, 12, 10), jumpFrame(5, 10, 50), jumpFrame(17, 0, 100), jumpFrame(30, -8, 15)], [0, 1, 2, 3]);
  const f = new CanvasFighter(1, god('zeus'), false, 300, 1); f.jump();
  let ticks = 0;
  while (!f.isGrounded && ticks++ < 90) f.update(1280, opponent, 'NORMAL', []);
  assert.equal((f as any).extraPose().frame, 3);
  step(f, 7); assert.equal((f as any).extraPose(), null);
});
test('Un golpe ligero no dibuja el cuerpo tendido; un K.O. nunca usa victoria o levantarse', () => {
  const f = new CanvasFighter(1, god('zeus'), false, 300, 1); f.enterHitstun(17);
  step(f, 16); assert.equal(f.frameIndex, 0);
  f.state = 'DEFEAT'; f.animTimer = 0;
  for (let i = 0; i < 45; i++) f.advanceFinish();
  assert.equal((f as any).extraPose(), null); assert.equal(f.frameIndex, f.spriteConfig.lyingFrame);
});
test('Victoria es determinista y espera a tocar el suelo', () => {
  assert.equal(victoryFrame(0), 2); assert.equal(victoryFrame(18), 3); assert.equal(victoryFrame(1000), 3);
  const f = new CanvasFighter(1, god('zeus'), false, 300, 1); f.state = 'VICTORY'; f.isGrounded = false; f.y = 450; f.vy = 2;
  assert.equal((f as any).extraPose().row, EXTRA_ROWS.jump);
  for (let i = 0; i < 60; i++) f.advanceFinish();
  assert.deepEqual((f as any).extraPose(), { row: EXTRA_ROWS.finish, frame: 3 });
});
test('Origen usa el tiempo real de sus poderes y su golpe fuerte', () => {
  const f = new OrigenFighter(ORIGEN, 900, -1);
  (f as any).move = 'collapse'; f.state = 'SPECIAL'; (f as any).moveTimer = 149;
  assert.equal((f as any).extraPose().frame, 1);
  (f as any).moveTimer = 150; assert.equal((f as any).extraPose().frame, 2);
  assert.equal(f.heavyImpactTick, 8);
});
test('Cargar y soltar magia usa el cuadro de liberación al aplicar el daño', () => {
  assert.equal(castFrame(39, 40, 80), 1); assert.equal(castFrame(40, 40, 80), 2); assert.equal(castFrame(79, 40, 80), 3);
});
test('Las hojas extra pendientes detienen el reloj y un fallo permite continuar con la principal', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL');
  const entry = loadSpriteSheet(getExtraSheetConfig(g.hero.deity)!.src);
  try {
    entry.status = 'loading'; assert.equal(g.loading, true);
    const tick = g.tick; g.step({ left:false,right:false,up:false,down:false,attack:false,jump:false,magic:false,tapLeft:false,tapRight:false }); assert.equal(g.tick, tick);
    const f = new CanvasFighter(1, god('zeus'), false, 300, 1); assert.equal(f.loading, true);
    entry.status = 'error'; assert.equal(g.loading, false); assert.equal(f.loading, false);
    f.state = 'VICTORY'; assert.equal((f as any).extraPose(), null);
  } finally { entry.status = 'ready'; }
});

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
test('Arcade celebra con la hoja extra y bloquea ataques durante los resultados', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); g.phase = 'levelClear';
  const magic = g.hero.magic;
  g.step({ ...idle, attack: true, magic: true, jump: true });
  assert.equal(g.hero.state, 'victory'); assert.equal(g.hero.magic, magic);
  assert.deepEqual((g.hero as any).extraPose(), { row: EXTRA_ROWS.finish, frame: 2 });
  for (let i = 0; i < 30; i++) g.step(idle);
  assert.deepEqual((g.hero as any).extraPose(), { row: EXTRA_ROWS.finish, frame: 3 });
  assert.equal(g.hero.receiveHit({ damage: 10, knockdown: true, heavy: true, dir: 1 }), false);
  g.phase = 'victory'; const timer = g.hero.stateTimer; g.step(idle); assert.ok(g.hero.stateTimer > timer);
});
test('Celebrar desmonta al héroe y no sustituye la caída de un jugador muerto', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL');
  const beast = new Beast(BEASTS.Grecia, g.hero.x, g.hero.z);
  g.hero.mount = beast; beast.rider = g.hero; g.hero.celebrate();
  assert.equal(g.hero.mount, null); assert.equal(beast.rider, null);
  const fallen = g.heroes[1]; fallen.hp = 0; fallen.setState('down'); fallen.celebrate();
  assert.equal(fallen.state, 'down');
});
test('El salto aplastante y el remate de los jefes conservan las hojas de Claude', () => {
  const boss = new Boss(ORIGEN, 900, 100, 500, 1, 900);
  boss.setState('special'); (boss as any).currentSpecial = 'slam'; boss.stateTimer = 24; boss.y = 50; boss.vy = 10;
  assert.equal((boss as any).extraPose().row, EXTRA_ROWS.jump);
  boss.y = 0; boss.vy = 0; (boss as any).currentSpecial = 'collapse'; boss.stateTimer = 149;
  assert.equal((boss as any).extraPose().frame, 1);
  boss.stateTimer = 150; assert.equal((boss as any).extraPose().frame, 2);
  (boss as any).comboHits = 1; boss.setState('windup');
  assert.deepEqual((boss as any).extraPose(), { row: EXTRA_ROWS.finish, frame: 0 });
  boss.setState('strike'); boss.stateTimer = 3;
  assert.deepEqual((boss as any).extraPose(), { row: EXTRA_ROWS.finish, frame: 1 });
});
test('Las estelas guardan la hoja extra que usó el ataque', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); g.hero.setState('attack'); g.hero.comboStep = 3; g.hero.stateTimer = 8;
  g.step(idle);
  assert.equal(g.hero.trail[0].extra, true);
  assert.equal(g.hero.trail[0].row, EXTRA_ROWS.finish);
  assert.equal(g.hero.trail[0].frame, 1);
});
test('La carga de la hoja extra del jefe también detiene la simulación', () => {
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); g.boss = new Boss(ORIGEN, 900, 100, 500, 1, 900);
  const entry = loadSpriteSheet(getExtraSheetConfig(ORIGEN)!.src);
  try {
    entry.status = 'loading'; assert.equal(g.boss.loading, true); assert.equal(g.loading, true);
    const tick = g.tick; g.step(idle); assert.equal(g.tick, tick);
  } finally { entry.status = 'ready'; }
});
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
  const g = new ArcadeGame(god('zeus'), 'NORMAL'); g.phase = 'levelClear'; (g as any).phaseTimer = 330;
  g.chooseRelic(2); assert.equal(g.relicChoice, 2); assert.equal(g.hero.blessing, 'arcana');
  const magic = g.hero.magic; g.chooseRelic(2); assert.equal(g.hero.magic, magic);
  for (let i = 0; i < 85; i++) g.step(idle);
  assert.equal(g.levelIndex, 1); assert.equal(g.relicChoice, null); assert.equal(g.hero.blessing, 'arcana');
});

test('Rescatar conserva vidas y magia, recupera vida parcial y protege al levantarse', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'boss';
  const [fallen, partner] = g.heroes; partner.x = fallen.x; partner.z = fallen.z;
  fallen.hp = 0; fallen.magic = 0; g.loseLife(fallen);
  assert.ok(g.rescues.has(fallen)); assert.equal(g.lifeLoss, null);
  assert.ok(!g.activeHeroes.includes(fallen));
  for (let i = 0; i < RESCUE_HOLD_TICKS; i++) g.step([idle, { ...idle, down: true }]);
  assert.equal(g.rescues.size, 0); assert.equal(fallen.hp, 35); assert.equal(fallen.lives, 3);
  assert.equal(fallen.deaths, 0); assert.equal(fallen.magic, 0); assert.ok(fallen.invuln > 0);
});

test('Rescate requiere cercanía continua y se interrumpe al recibir un golpe', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'boss';
  const [fallen, partner] = g.heroes; fallen.hp = 0; g.loseLife(fallen);
  partner.x = fallen.x; partner.z = fallen.z;
  for (let i = 0; i < 20; i++) g.step([idle, { ...idle, down: true }]);
  assert.equal(g.rescues.get(fallen)?.progress, 20);
  partner.invuln = 0; partner.receiveHit({ damage: 1, knockdown: false, heavy: false, dir: 1 });
  g.step([idle, { ...idle, down: true }]); assert.equal(g.rescues.get(fallen)?.progress, 0);
  partner.setState('idle'); partner.x = fallen.x + 200;
  for (let i = 0; i < RESCUE_HOLD_TICKS; i++) g.step([idle, { ...idle, down: true }]);
  assert.equal(fallen.hp, 0); assert.equal(g.rescues.get(fallen)?.progress, 0);
});

test('Rescate respeta pausa y al expirar pierde exactamente una vida', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'boss';
  const [fallen, partner] = g.heroes; fallen.hp = 0; partner.x = fallen.x + 300; g.loseLife(fallen);
  g.paused = true; for (let i = 0; i < 100; i++) g.step(idle);
  assert.equal(g.rescues.get(fallen)?.remaining, RESCUE_WINDOW_TICKS);
  g.paused = false;
  for (let i = 0; i < RESCUE_WINDOW_TICKS; i++) g.step(idle);
  assert.equal(g.rescues.size, 0); assert.ok(g.lifeLoss); assert.equal(fallen.lives, 2); assert.equal(fallen.deaths, 1);
  g.loseLife(fallen); assert.equal(fallen.lives, 2);
  for (let i = 0; i < LIFE_LOSS_TICKS; i++) g.step(idle);
  assert.equal(fallen.hp, fallen.maxHp);
});

test('Continuar individualmente cobra una sola vez al jugador que regresa', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'boss';
  const [fallen, partner] = g.heroes;
  fallen.gameOver = true; fallen.lives = 0; fallen.hp = 0; fallen.score = 1001; partner.score = 2000;
  g.step([{ ...idle, attack: true }, idle]);
  assert.equal(fallen.score, 500); assert.equal(partner.score, 2000); assert.equal(fallen.lives, 3);
  g.step([{ ...idle, attack: true }, idle]); assert.equal(fallen.score, 500);
});

test('Caer ambos durante un rescate agota la última vida y permite continuar sin duplicar costos', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL');
  const [first, second] = g.heroes;
  first.lives = second.lives = 1; first.score = second.score = 1000;
  first.hp = 0; g.loseLife(first); g.loseLife(first);
  assert.equal(first.lives, 1); assert.equal(first.deaths, 0);
  second.hp = 0; g.loseLife(second);
  assert.equal(g.rescues.size, 0);
  for (let i = 0; i < LIFE_LOSS_TICKS * 2; i++) g.step(idle);
  assert.equal(g.phase, 'gameOver'); assert.deepEqual(g.heroes.map(hero => hero.deaths), [1, 1]);
  g.continueGame(); assert.deepEqual(g.heroes.map(hero => hero.score), [500, 500]);
});

test('Vencer al jefe rescata al compañero y conserva su elección de bendición', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'boss';
  const fallen = g.heroes[0]; fallen.hp = 0; g.loseLife(fallen);
  g.boss = new Boss(god('hades'), 800, 100, 1, 1, 800); g.boss.hp = 0;
  g.step([idle, idle]);
  assert.equal(g.phase, 'levelClear'); assert.equal(g.rescues.size, 0);
  assert.equal(fallen.hp, 35); assert.equal(fallen.lives, 3); assert.equal(fallen.deaths, 0);
  (g as any).phaseTimer = 330; g.chooseRelic(0, 1);
  assert.equal(g.relicsComplete, false); g.chooseRelic(1, 0); assert.equal(g.relicsComplete, true);
  const simultaneous = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); simultaneous.phase = 'boss';
  simultaneous.hero.hp = 0; simultaneous.hero.setState('down');
  simultaneous.boss = new Boss(god('hades'), 800, 100, 1, 1, 800); simultaneous.boss.hp = 0;
  simultaneous.step([idle, idle]); assert.equal(simultaneous.phase, 'levelClear');
  assert.equal(simultaneous.hero.hp, 35); assert.equal(simultaneous.hero.lives, 3);
});

test('Continuar tras caer ambos cobra la mitad a cada jugador una sola vez', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL');
  for (const hero of g.heroes) { hero.gameOver = true; hero.lives = 0; hero.hp = 0; hero.score = 1000; }
  g.phase = 'gameOver'; g.continueGame(); g.continueGame();
  assert.deepEqual(g.heroes.map(hero => hero.score), [500, 500]);
  assert.deepEqual(g.heroes.map(hero => hero.lives), [3, 3]);
});

test('Cada jugador recibe su bendición y el nivel espera ambas confirmaciones', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'levelClear'; (g as any).phaseTimer = 330;
  g.chooseRelic(0, 0); assert.equal(g.heroes[0].blessing, 'might'); assert.equal(g.heroes[1].blessing, null);
  for (let i = 0; i < 100; i++) g.step(idle);
  assert.equal(g.levelIndex, 0); assert.equal(g.relicsComplete, false);
  g.chooseRelic(2, 1); const magic = g.heroes[1].magic;
  g.chooseRelic(1, 1); g.chooseRelic(1, 9);
  assert.deepEqual(g.relicChoices, [0, 2]); assert.equal(g.heroes[1].magic, magic);
  assert.equal(g.heroes[1].blessing, 'arcana');
  for (let i = 0; i < 74; i++) g.step(idle); assert.equal(g.levelIndex, 0);
  g.step(idle); assert.equal(g.levelIndex, 1); assert.deepEqual(g.relicChoices, [null, null]);
  assert.deepEqual(g.heroes.map(hero => hero.blessing), ['might', 'arcana']);
});

test('Los controles de bendición son independientes y un jugador eliminado no bloquea al otro', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'levelClear'; (g as any).phaseTimer = 330;
  g.step([{ ...idle, tapRight: true }, { ...idle, tapLeft: true }]);
  assert.deepEqual(g.relicCursors, [1, 2]);
  g.step([{ ...idle, attack: true }, { ...idle, attack: true }]); assert.deepEqual(g.relicChoices, [1, 2]);
  const solo = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); solo.phase = 'levelClear'; (solo as any).phaseTimer = 330;
  solo.heroes[1].gameOver = true; solo.chooseRelic(2, 1); assert.equal(solo.relicChoices[1], null);
  solo.chooseRelic(1, 0); for (let i = 0; i < 75; i++) solo.step(idle);
  assert.equal(solo.levelIndex, 1);
});

const teamHit = { damage: 10, knockdown: false, heavy: false, dir: 1 as const };
function linkedEnemies() {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL');
  const a = new Monster('brute', LEVELS[0].skins.brute, 500, 100, 1, 1);
  const b = new Monster('grunt', LEVELS[0].skins.grunt, 750, 100, 1, 1);
  g.monsters = [a, b]; (g as any).waveActive = true;
  (g as any).updateCoopTactics();
  return { g, a, b };
}
function guardedBoss() {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'boss';
  g.boss = new Boss(god('hades'), 640, 100, 1000, 1, 640); g.boss.setState('idle');
  g.heroes[0].x = 500; g.heroes[1].x = 780;
  (g as any).coopGuardCooldown = 0; (g as any).updateCoopTactics();
  return { g, boss: g.boss };
}
test('Enemigos enlazados reparten objetivos y solo dos jugadores sobre rivales distintos los abren', () => {
  const { g, a, b } = linkedEnemies(); assert.ok(g.coopLink);
  assert.deepEqual([a.coopAssignment, b.coopAssignment], [0, 1]);
  const hp = a.hp; (g as any).applyHit(a, teamHit, g.heroes[0]); assert.equal(a.hp, hp - 6);
  (g as any).applyHit(b, teamHit, g.heroes[0]); assert.ok(g.coopLink);
  a.invuln = 0; (g as any).applyHit(a, teamHit, g.heroes[1]);
  assert.equal(g.coopLink, null); assert.equal(a.state, 'recover'); assert.ok(a.stateTimer < 0);
  assert.deepEqual([a.coopAssignment, b.coopAssignment], [null, null]);
  a.invuln = 0; const openedHp = a.hp; (g as any).applyHit(a, teamHit, g.heroes[0]); assert.equal(a.hp, openedHp - 10);
});
test('Un enlace no se rompe golpeando el mismo enemigo ni con golpes demasiado separados', () => {
  const { g, a, b } = linkedEnemies();
  (g as any).applyHit(a, teamHit, g.heroes[0]); a.invuln = 0;
  (g as any).applyHit(a, teamHit, g.heroes[1]); assert.ok(g.coopLink);
  g.tick += COOP_LINK_WINDOW + 1; b.invuln = 0;
  (g as any).applyHit(b, teamHit, g.heroes[0]); assert.ok(g.coopLink);
});
test('Los enlaces no reaparecen en la misma oleada y liberan protección si cae el compañero o muere un miembro', () => {
  const { g, a, b } = linkedEnemies();
  (g as any).applyHit(a, teamHit, g.heroes[0]); (g as any).applyHit(b, teamHit, g.heroes[1]);
  (g as any).updateCoopTactics(); assert.equal(g.coopLink, null);
  const downed = linkedEnemies(); downed.g.heroes[0].hp = 0; downed.g.loseLife(downed.g.heroes[0]);
  assert.equal(downed.g.coopLink, null); assert.equal(downed.a.coopAssignment, null);
  const killed = linkedEnemies(); killed.a.hp = 0; (killed.g as any).updateCoopTactics();
  assert.equal(killed.g.coopLink, null); assert.equal(killed.b.coopAssignment, null);
});
test('Solo no activa tácticas y las parejas excluyen monstruos fuera de pantalla, jinetes, ladrones y mini-jefes', () => {
  const solo = new ArcadeGame(god('zeus'), 'NORMAL'); (solo as any).waveActive = true;
  solo.monsters = [new Monster('grunt', LEVELS[0].skins.grunt, 400, 100, 1, 1), new Monster('brute', LEVELS[0].skins.brute, 600, 100, 1, 1)];
  (solo as any).coopGuardCooldown = 0; (solo as any).updateCoopTactics(); assert.equal(solo.coopLink, null); assert.equal(solo.coopGuard, null);
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); (g as any).waveActive = true;
  g.monsters = [new Monster('grunt', LEVELS[0].skins.grunt, -50, 100, 1, 1), new Monster('mini', LEVELS[0].skins.mini, 400, 100, 1, 1), new Monster('thief', LEVELS[0].skins.grunt, 600, 100, 1, 1)];
  (g as any).updateCoopTactics(); assert.equal(g.coopLink, null);
  const rider = new Monster('grunt', LEVELS[0].skins.grunt, 450, 100, 1, 1);
  rider.mount = new Beast(BEASTS.Grecia, 450, 100);
  g.monsters = [rider, new Monster('grunt', LEVELS[0].skins.grunt, 650, 100, 1, 1)];
  (g as any).updateCoopTactics(); assert.equal(g.coopLink, null);
});
test('Guardia de jefe mantiene orientación y solo se abre con jugadores distintos desde lados opuestos', () => {
  const { g, boss } = guardedBoss(); assert.ok(boss.coopGuarding);
  boss.update(g); assert.equal(boss.state, 'guard'); assert.equal(boss.vx, 0);
  const hp = boss.hp; (g as any).applyHit(boss, teamHit, g.heroes[0]); assert.equal(boss.hp, hp - 5.5);
  g.heroes[1].x = 500; boss.invuln = 0; (g as any).applyHit(boss, teamHit, g.heroes[1]); assert.ok(g.coopGuard);
  g.heroes[1].x = 780; boss.invuln = 0; (g as any).applyHit(boss, teamHit, g.heroes[1]);
  assert.equal(g.coopGuard, null); assert.equal(boss.coopGuarding, false); assert.equal(boss.state, 'recover'); assert.equal(boss.stateTimer, -60);
  for (let i = 0; i < 6; i++) { boss.invuln = 0; boss.receiveHit(teamHit); }
  assert.equal((boss as any).escapePending, false);
});
test('Guardia no acepta un solo jugador flanqueando ni marcas caducadas; termina y respeta cooldown', () => {
  const { g, boss } = guardedBoss();
  (g as any).applyHit(boss, teamHit, g.heroes[0]);
  g.heroes[0].x = 780; boss.invuln = 0; (g as any).applyHit(boss, teamHit, g.heroes[0]); assert.ok(g.coopGuard);
  g.tick += COOP_LINK_WINDOW + 1; g.heroes[1].x = 500; boss.invuln = 0;
  (g as any).applyHit(boss, teamHit, g.heroes[1]); assert.ok(g.coopGuard);
  for (let i = 0; i < COOP_GUARD_TICKS; i++) (g as any).updateCoopTactics();
  assert.equal(g.coopGuard, null); assert.equal(boss.coopGuarding, false);
  boss.setState('idle'); (g as any).updateCoopTactics(); assert.equal(g.coopGuard, null);
});
test('Guardia desaparece al quedar uno en pie y nunca interrumpe un poder, una introducción o una caída', () => {
  const { g, boss } = guardedBoss(); g.heroes[1].gameOver = true;
  (g as any).updateCoopTactics(); assert.equal(g.coopGuard, null); assert.equal(boss.coopGuarding, false);
  g.heroes[1].gameOver = false;
  for (const state of ['special', 'intro', 'down', 'windup'] as const) {
    boss.setState(state); (g as any).coopGuardCooldown = 0; (g as any).updateCoopTactics(); assert.equal(g.coopGuard, null);
  }
  boss.setState('idle'); boss.x = 40; (g as any).updateCoopTactics(); assert.equal(g.coopGuard, null);
});
test('Rayos cooperativos alternan objetivos y sus círculos no persiguen al jugador después del aviso', () => {
  const g = new ArcadeGame([god('zeus'), god('ra')], 'NORMAL'); g.phase = 'boss';
  const boss = g.boss = new Boss(god('raijin'), 640, 100, 1000, 1, 640);
  g.heroes[0].x = 300; g.heroes[1].x = 950;
  boss.setState('special'); (boss as any).currentSpecial = 'thunder'; boss.stateTimer = 9; boss.update(g);
  assert.equal(g.thunders[0].x, 300);
  g.heroes[0].x = 400; boss.stateTimer = 39; boss.update(g);
  assert.equal(g.thunders[0].x, 300); assert.equal(g.thunders[1].x, 950);
  g.heroes[0].gameOver = true; g.heroes[1].x = 800; boss.stateTimer = 69; boss.update(g);
  assert.equal(g.thunders[2].x, 800);
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
  localStorage.setItem('mythic-clash-mastery-v1', '{}');
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

if (process.env.MYTHIC_COOP_SOAK === '1') {
  let seed = 20261101;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let totalGuards = 0;
  for (const pair of [['susanoo', 'anubis'], ['zeus', 'poseidon']]) {
    const g = new ArcadeGame(pair.map(god), 'NORMAL');
    let links = 0, guards = 0, lastHint = '';
    for (let tick = 0; tick < 54000 && g.phase !== 'victory' && g.phase !== 'finalOver'; tick++) {
      if (g.phase === 'gameOver') g.continueGame();
      if (g.relicOfferReady) g.heroes.forEach(hero => g.chooseRelic(hero.index ? 2 : 1, hero.index));
      const inputs = g.heroes.map(hero => {
        if (hero.gameOver) return { ...idle, attack: tick % 20 === 0 };
        const fallen = [...g.rescues.keys()].find(other => other !== hero);
        const targets = [...g.monsters.filter(monster => monster.kind !== 'thief' && !monster.isDown && monster.hp > 0), ...(g.boss && !g.boss.isDown && g.boss.hp > 0 ? [g.boss] : [])];
        const target = g.coopGuard?.boss ?? g.coopLink?.members[hero.index] ?? targets.sort((a, b) => Math.abs(a.x - hero.x) + Math.abs(a.z - hero.z) - Math.abs(b.x - hero.x) - Math.abs(b.z - hero.z))[0];
        const dx = (fallen ? fallen.x : target ? target.x + (g.coopGuard ? hero.index ? 95 : -95 : hero.x < target.x ? -75 : 75) : hero.x + 500) - hero.x;
        const dz = (fallen?.z ?? target?.z ?? hero.z) - hero.z;
        const facing = !target || hero.facing === (target.x >= hero.x ? 1 : -1);
        return { ...idle, left: dx < -8 || (!fallen && !facing && target.x < hero.x), right: dx > 8 || (!fallen && !facing && target.x >= hero.x), up: dz < -6,
          down: fallen && Math.abs(dx) <= 100 && Math.abs(dz) <= 36 ? true : dz > 6,
          attack: !fallen && !!target && Math.abs(target.x - hero.x) < 150 && facing && tick % 7 === 0,
          magic: !fallen && !g.coopGuard && !g.coopLink && !!g.boss && hero.magic > 0 && tick % 120 === 0 };
      });
      g.step(inputs);
      const hint = g.coopTacticHint;
      if (hint !== lastHint && hint.startsWith('ENLACE ROTO')) links++;
      if (hint !== lastHint && hint.startsWith('GUARDIA ROTA')) guards++;
      lastHint = hint;
      for (const hero of g.heroes) assert.ok(Number.isFinite(hero.x) && Number.isFinite(hero.hp) && hero.hp >= 0 && hero.hp <= hero.maxHp);
    }
    console.log(`Recorrido cooperativo ${pair.join(' + ')}: reino ${g.levelIndex + 1}, ${g.phase}, ${links} enlaces y ${guards} guardias rotas`);
    assert.ok(g.levelIndex > 0, 'El equipo no pudo avanzar del primer reino');
    assert.ok(links > 0, 'El controlador no logró romper ningún enlace');
    totalGuards += guards;
  }
  assert.ok(totalGuards > 0, 'Los controladores no lograron flanquear a ningún jefe');
}
