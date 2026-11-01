import assert from 'node:assert/strict';
const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }, Image: class { onload: (() => void) | null = null; width = 2688; height = 984; set src(_: string) { this.onload?.(); } addEventListener() {} removeEventListener() {} } });
const { ArcadeGame, Monster, Boss } = await import('../src/arcade/engine');
const { DEITIES, REALM_PANTHEONS } = await import('../src/game/deities');
const { LEVELS, BEASTS, BOSS_SPECIALS, buildWaves } = await import('../src/arcade/levels');
const { createRoute, validRoute, gradePoints, gradeLetter, saveSurvivalRecord, survivalRecords } = await import('../src/arcade/run');
const { SnapshotWriter, SnapshotReader } = await import('../src/lan/snapshot');
const { fighterState, applyFighterState, applyFlow, readVersusInput, compactVersus, expandVersus, VersusMotion } = await import('../src/lan/versus');
const { CanvasFighter } = await import('../src/App');
const { MatchFlow } = await import('../src/game/match');
const { situationalDamage } = await import('../src/game/styles');
const { buildTower, TOWER_FLOORS, TOWER_ENDINGS } = await import('../src/game/tower');
const { ORIGEN } = await import('../src/arcade/levels');
const { sounds } = await import('../src/game/sound'); sounds.isMuted = true;
const idle = { left: false, right: false, up: false, down: false, attack: false, jump: false, magic: false, tapLeft: false, tapRight: false };
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }
const gods = ['anubis', 'amaterasu'].map(id => DEITIES.find(deity => deity.id === id)!);
const make = (kind: 'arcade' | 'survival' = 'arcade') => new ArcadeGame(gods, 'NORMAL', { kind });
test('Todas las parejas excluyen a sus dioses y visitan todos los reinos una sola vez', () => {
  for (const first of DEITIES) for (const second of DEITIES) { const route = createRoute([first.id, second.id], Math.random, false); assert.ok(validRoute(route, [first.id, second.id])); }
  const route = createRoute(['zeus', 'poseidon']); assert.equal(route.find(stop => stop.realm === 0)?.boss, 'hades');
});
test('La ruta reciente evita repetir inicio y guardianes cuando hay alternativas', () => {
  storage.clear(); const first = createRoute(gods.map(deity => deity.id), () => .1), next = createRoute(gods.map(deity => deity.id), () => .1);
  assert.notEqual(first[0].realm, next[0].realm);
  for (const stop of first) assert.notEqual(stop.boss, next.find(item => item.realm === stop.realm)?.boss);
});
test('La posición determina dificultad y el reino conserva enemigos y arte', () => {
  const game = make(); game.route = [{ realm: 3, boss: 'raijin' }, { realm: 2, boss: 'mictlantecuhtli' }, { realm: 1, boss: 'ra' }, { realm: 0, boss: 'zeus' }, { realm: 4, boss: 'thor' }];
  (game as any).startLevel(0); assert.equal(game.level, LEVELS[3]); assert.equal(game.stageDifficulty, 0); assert.equal((game as any).bossDeity.id, 'raijin');
  (game as any).startLevel(3); assert.equal(game.level, LEVELS[0]); assert.equal(game.stageDifficulty, 3);
  (game as any).startLevel(LEVELS.length); assert.equal((game as any).bossDeity.id, 'origen');
});
test('Resultados acumulan cifras por etapa y promedian desempeño antes de convertir a letra', () => {
  const game = make(); game.tick = 6000; game.hero.kills = 10; game.hero.deaths = 1; game.hero.maxCombo = 8;
  (game as any).rememberStage(); assert.equal(game.totals.secs, 100); assert.equal(game.history[0].players[0].kills, 10);
  const grade = gradePoints(1, 100, 8); assert.equal(game.history[0].players[0].grade, grade);
  game.prepareRemoteLevel(1); assert.equal(game.hero.kills, 0); assert.equal(game.history[0].players[0].kills, 10);
  assert.equal(gradeLetter((1 + 1 + 1 + 1 + 3) / 5), 'B');
});
test('Enemigos y minijefes cuentan una vez, sin depender de los contadores reiniciados', () => {
  const game = make(), mini = new Monster('mini', game.level.skins.mini, 500, 100, 1, 1);
  (game as any).defeatMonster(mini, game.hero); (game as any).defeatMonster(mini, game.hero);
  assert.equal(game.totals.kills, 1); assert.equal(game.totals.minis, 1); game.prepareRemoteLevel(1); assert.equal(game.totals.kills, 1);
});
test('Supervivencia avanza sin límite, aumenta presión y espera bendiciones cada cinco oleadas', () => {
  const game = make('survival');
  for (let wave = 0; wave < 31; wave++) {
    if (wave) (game as any).startLevel(wave);
    assert.notEqual(game.level.title, 'El Telar del Cosmos');
    if ((wave + 1) % 5 === 0) {
      (game as any).startBossIntro(); game.boss!.hp = 0; game.boss!.setState('idle'); game.phase = 'boss'; game.step([idle, idle]);
    } else (game as any).clearSurvivalWave();
    assert.equal(game.completedWaves, wave + 1);
    (game as any).phaseTimer = 330;
    assert.equal(game.relicOfferReady, (wave + 1) % 5 === 0);
    assert.ok(game.history.length <= 10);
  }
  assert.ok(game.stageDifficulty > 5); assert.ok((game as any).hpMul > 1); assert.ok(game.calmFactor < 1);
});
test('Supervivencia termina sin continuaciones y registra solo oleadas completadas', () => {
  const game = make('survival'); game.completedWaves = 28; game.heroes.forEach(hero => { hero.gameOver = true; hero.score = 1234; });
  game.step([idle, idle]); assert.equal(game.phase, 'finalOver'); game.continueGame(); assert.equal(game.phase, 'finalOver');
  const record = survivalRecords(true, 'NORMAL')[0]; assert.equal(record.wave, 28); assert.equal(record.score, 2468); assert.deepEqual(record.characters, ['anubis', 'amaterasu']);
});
test('Récords separan modalidad y dificultad, ordenan por oleada y después puntos', () => {
  storage.clear(); for (const [wave, score] of [[10, 500], [12, 100], [12, 400]]) saveSurvivalRecord({ characters: ['susanoo'], wave, score, difficulty: 'NORMAL', date: String(score) });
  assert.deepEqual(survivalRecords(false, 'NORMAL').map(record => record.score), [400, 100, 500]); assert.equal(survivalRecords(true, 'NORMAL').length, 0); assert.equal(survivalRecords(false, 'DIFICIL').length, 0);
});
test('Wi-Fi reconstruye ruta, oleadas mayores de cinco y resultados acumulados', () => {
  const host = make('survival'), guest = make('survival'); (host as any).startLevel(28); host.completedWaves = 28; host.totals.kills = 400;
  new SnapshotReader().apply(guest, JSON.parse(JSON.stringify(new SnapshotWriter().capture(host)))); assert.equal(guest.levelIndex, 28); assert.equal(guest.level, host.level); assert.equal(guest.completedWaves, 28); assert.equal(guest.totals.kills, 400);
});
test('El reloj y las caídas finales quedan congelados y el récord no se duplica', () => {
  const game = make('survival'); game.tick = 600; game.hero.deaths = 2; game.heroes.forEach(hero => hero.gameOver = true); game.step([idle, idle]);
  const seconds = game.elapsedSeconds, deaths = game.totals.deaths;
  for (let i = 0; i < 180; i++) game.step([idle, idle]);
  assert.equal(game.elapsedSeconds, seconds); assert.equal(game.totals.deaths, deaths);
});
test('Una oleada real no se cierra antes de terminar sus spawns ni vuelve a contarse', () => {
  const game = make('survival'); game.step([idle, idle]); assert.ok((game as any).waveActive); assert.equal(game.completedWaves, 0);
  (game as any).pending = []; game.monsters = []; game.step([idle, idle]); game.step([idle, idle]);
  assert.equal(game.phase, 'levelClear'); assert.equal(game.completedWaves, 1);
  for (let i = 0; i < 145; i++) game.step([idle, idle]); assert.equal(game.completedWaves, 1);
});
test('Versus transmite combate y marcador sin reemplazar recursos, clases o métodos', () => {
  const host = new CanvasFighter(2, gods[1], false, 800, -1), guest = new CanvasFighter(2, gods[1], false, 1000, -1); host.hp = 74; host.state = 'KNOCKDOWN'; host.x = 612;
  const state = JSON.parse(JSON.stringify(fighterState(host))); applyFighterState(guest, { ...state, render: 'malicioso', sheet: null, spriteConfig: 'malicioso' });
  assert.equal(guest.hp, 74); assert.equal(guest.state, 'KNOCKDOWN'); assert.equal(guest.x, 612); assert.ok(guest.sheet); assert.equal(typeof guest.render, 'function');
  const flow = new MatchFlow(); applyFlow(flow, { phase: 'ko', wins: [1, 2], elapsed: 80, round: 3, roundWinner: 2, reason: 'ko' }); assert.deepEqual(flow.wins, [1, 2]); assert.equal(flow.roundWinner, 2);
  assert.equal(readVersusInput({ light: 'true', heavy: true }).light, false); assert.equal(readVersusInput({ heavy: true }).heavy, true);
});
test('El formato compacto conserva todos los campos y reduce el tamaño del duelo', () => {
  const fighters = [new CanvasFighter(1, gods[0], false, 280, 1), new CanvasFighter(2, gods[1], false, 1000, -1)];
  const state = { fighters: fighters.map(fighterState), flow: { phase: 'fight', wins: [0, 0] }, timer: 99, frame: 100, shake: 0, cinematic: null };
  const compact = compactVersus(state), restored = expandVersus(JSON.parse(JSON.stringify(compact)));
  assert.deepEqual(restored.fighters, state.fighters);
  const before = JSON.stringify(state).length, after = JSON.stringify(compact).length;
  assert.ok(after < before * .85); console.log(`  Cuadro versus: ${before} → ${after} bytes`);
});
test('El invitado alcanza antes su propia posición sin predecir golpes y los reinicios no se arrastran', () => {
  let now = 1000;
  const fighters = [new CanvasFighter(1, gods[0], false, 280, 1), new CanvasFighter(2, gods[1], false, 1000, -1)];
  const motion = new VersusMotion(() => now);
  motion.apply(fighters, [{ ...fighterState(fighters[0]), x: 320 }, { ...fighterState(fighters[1]), x: 1040 }]);
  now += 17; motion.smooth(now); assert.equal(fighters[1].x, 1040); assert.ok(fighters[0].x > 280 && fighters[0].x < 320);
  motion.apply(fighters, [{ ...fighterState(fighters[0]), x: 280 }, { ...fighterState(fighters[1]), x: 1000 }], true);
  motion.smooth(now); assert.equal(fighters[0].x, 280); assert.equal(fighters[1].x, 1000);
});
test('El catálogo separa cinco reinos de Sun Wukong como invitado', () => {
  assert.equal(DEITIES.length, 16); assert.equal(REALM_PANTHEONS.length, 5); assert.equal(LEVELS.length, 5);
  assert.equal(DEITIES.find(deity => deity.id === 'sunwukong')?.pantheon, 'Invitado');
  assert.ok(!LEVELS.some(level => level.bossOrder.includes('sunwukong')));
  const route = createRoute(['odin', 'thor']); assert.equal(route.find(stop => LEVELS[stop.realm].pantheon === 'Nórdico')?.boss, 'loki');
});
test('Los cuatro súper nuevos conectan, consumen energía y vuelven a una fase jugable', () => {
  for (const id of ['odin', 'thor', 'loki', 'sunwukong']) {
    const fighter = new CanvasFighter(1, DEITIES.find(deity => deity.id === id)!, false, 300, 1);
    const rival = new CanvasFighter(2, DEITIES[0], false, 400, -1); rival.hp = rival.maxHp = 300;
    fighter.superMeter = 100; assert.equal(fighter.executeSpecial(rival), true);
    for (let tick = 0; tick < 80; tick++) { fighter.update(1280, rival, 'NORMAL', []); rival.update(1280, fighter, 'NORMAL', []); }
    assert.ok(rival.hp < 300, `${id} no conectó su súper`); assert.notEqual(fighter.state, 'SPECIAL'); assert.ok(fighter.superMeter < 100);
  }
});
test('Las pasivas nuevas tienen condición y no sustituyen los perfiles existentes', () => {
  assert.equal(situationalDamage('odin', true, 140, false, false, 0), 1.25); assert.equal(situationalDamage('odin', true, 80, false, false, 0), 1);
  assert.equal(situationalDamage('thor', true, 80, false, true, 0), 1.25); assert.equal(situationalDamage('thor', false, 80, false, true, 0), 1);
  assert.equal(situationalDamage('loki', false, 80, true, false, 0), 1.25); assert.equal(situationalDamage('loki', false, 80, false, false, 0), 1);
  assert.equal(situationalDamage('sunwukong', false, 80, false, false, 2), 1.15); assert.equal(situationalDamage('sunwukong', false, 80, false, false, 1), 1);
});
test('El reino nórdico recorre sus oleadas, Vargr y poderes de jefes', () => {
  const realm = LEVELS.findIndex(level => level.pantheon === 'Nórdico'); assert.ok(realm >= 0); assert.equal(BEASTS.Nórdico?.id, 'vargr');
  const waves = buildWaves(realm, 0); assert.ok(waves.some(wave => wave.spawns.some(spawn => spawn.mounted)));
  assert.ok(waves.some(wave => wave.spawns.some(spawn => spawn.kind === 'mini')));
  const game = make(); game.route = [{ realm, boss: 'loki' }, ...game.route.filter(stop => stop.realm !== realm)];
  (game as any).startLevel(0); game.step([idle, idle]);
  for (let i = 0; i < 400; i++) { game.heroes.forEach(hero => hero.invuln = 1000); game.step([{ ...idle, right: true }, { ...idle, right: true }]); }
  assert.ok(game.monsters.some(monster => monster.skin.spriteId === 'draugr'));
  for (const id of ['odin', 'thor', 'loki']) for (const special of BOSS_SPECIALS[id]) {
    const boss = new Boss(DEITIES.find(deity => deity.id === id)!, 800, game.hero.z, 1000, 1, 800); game.boss = boss;
    (boss as any).currentSpecial = special; boss.setState('special');
    for (let tick = 0; tick < 100; tick++) boss.update(game);
    assert.ok(Number.isFinite(boss.x) && Number.isFinite(boss.hp));
  }
});
test('Supervivencia reparte los encuentros de jefe entre los cinco reinos', () => {
  const game = make('survival'), encountered = new Set<string>();
  for (let wave = 5; wave <= 25; wave += 5) { (game as any).startLevel(wave - 1); encountered.add(game.level.pantheon); }
  assert.equal(encountered.size, LEVELS.length);
});
test('La Torre integra nórdicos, mantiene diez rivales y permite final del invitado', () => {
  for (const hero of DEITIES) {
    const run = buildTower(hero, ORIGEN);
    assert.equal(run.rivals.length, TOWER_FLOORS + 1); assert.equal(TOWER_FLOORS, 10); assert.equal(run.rivals.at(-1)?.id, 'origen');
    assert.ok(!run.rivals.some(rival => rival.id === hero.id));
    for (const realm of REALM_PANTHEONS) assert.equal(run.rivals.filter(rival => rival.pantheon === realm && rival.id !== 'origen').length, 2);
    assert.ok(TOWER_ENDINGS[hero.id]);
  }
});
console.log(`\n${passed} pruebas de rutas, supervivencia, resultados y versus aprobadas.`);
