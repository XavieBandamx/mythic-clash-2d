import assert from 'node:assert/strict';
const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }, Image: class { onload: (() => void) | null = null; width = 2688; height = 984; set src(_: string) { this.onload?.(); } addEventListener() {} removeEventListener() {} } });
const { ArcadeGame, Monster, Boss } = await import('../src/arcade/engine');
const { DEITIES } = await import('../src/game/deities');
const { LEVELS } = await import('../src/arcade/levels');
const { createRoute, validRoute, gradePoints, gradeLetter, saveSurvivalRecord, survivalRecords } = await import('../src/arcade/run');
const { SnapshotWriter, SnapshotReader } = await import('../src/lan/snapshot');
const { fighterState, applyFighterState, applyFlow, readVersusInput } = await import('../src/lan/versus');
const { CanvasFighter } = await import('../src/App');
const { MatchFlow } = await import('../src/game/match');
const { sounds } = await import('../src/game/sound'); sounds.isMuted = true;
const idle = { left: false, right: false, up: false, down: false, attack: false, jump: false, magic: false, tapLeft: false, tapRight: false };
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`); }
const gods = ['anubis', 'amaterasu'].map(id => DEITIES.find(deity => deity.id === id)!);
const make = (kind: 'arcade' | 'survival' = 'arcade') => new ArcadeGame(gods, 'NORMAL', { kind });
test('Todas las parejas excluyen a sus dioses y visitan los cuatro reinos una sola vez', () => {
  for (const first of DEITIES) for (const second of DEITIES) { const route = createRoute([first.id, second.id], Math.random, false); assert.ok(validRoute(route, [first.id, second.id])); }
  const route = createRoute(['zeus', 'poseidon']); assert.equal(route.find(stop => stop.realm === 0)?.boss, 'hades');
});
test('La ruta reciente evita repetir inicio y guardianes cuando hay alternativas', () => {
  storage.clear(); const first = createRoute(gods.map(deity => deity.id), () => .1), next = createRoute(gods.map(deity => deity.id), () => .1);
  assert.notEqual(first[0].realm, next[0].realm);
  for (const stop of first) assert.notEqual(stop.boss, next.find(item => item.realm === stop.realm)?.boss);
});
test('La posición determina dificultad y el reino conserva enemigos y arte', () => {
  const game = make(); game.route = [{ realm: 3, boss: 'raijin' }, { realm: 2, boss: 'mictlantecuhtli' }, { realm: 1, boss: 'ra' }, { realm: 0, boss: 'zeus' }];
  (game as any).startLevel(0); assert.equal(game.level, LEVELS[3]); assert.equal(game.stageDifficulty, 0); assert.equal((game as any).bossDeity.id, 'raijin');
  (game as any).startLevel(3); assert.equal(game.level, LEVELS[0]); assert.equal(game.stageDifficulty, 3);
  (game as any).startLevel(4); assert.equal((game as any).bossDeity.id, 'origen');
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
console.log(`\n${passed} pruebas de rutas, supervivencia, resultados y versus aprobadas.`);
