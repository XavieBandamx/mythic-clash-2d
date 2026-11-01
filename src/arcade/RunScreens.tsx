import { DEITIES } from '../game/deities';
import { FINAL_LEVEL, LEVELS } from './levels';
import { gradeLetter, survivalRecords } from './run';
import type { RouteStop } from './run';
import type { ArcadeGame } from './engine';

export function RunRoute({ route, survival, ready }: { route: RouteStop[]; survival: boolean; ready: () => void }) {
  return <section className="run-screen" aria-label="Ruta de la partida"><div className="run-heading"><span className="title-eyebrow">{survival ? 'SOBREVIVE A LOS DIOSES' : 'UNA NUEVA AVENTURA'}</span><h2>{survival ? 'El desafío no termina' : 'Tu camino hacia el Origen'}</h2><p>{survival ? 'Sin continuaciones. Un jefe cada cinco oleadas; después, elige tu bendición.' : 'Cuatro reinos, guardianes distintos. La dificultad aumenta con cada etapa.'}</p></div>
    <div className="run-route">{route.map((stop, i) => <article key={stop.realm}><span>0{i + 1} / {LEVELS[stop.realm].pantheon}</span><img src={`/portraits/${stop.boss}.webp`} alt="" /><strong>{LEVELS[stop.realm].title}</strong><small>{DEITIES.find(deity => deity.id === stop.boss)?.name}</small></article>)}{!survival && <article className="run-final"><span>05 / ENCUENTRO FINAL</span><img src="/portraits/origen.webp" alt="" /><strong>{FINAL_LEVEL.title}</strong><small>El Origen</small></article>}</div>
    <button className="arena-confirm" onClick={ready}>Estoy listo · Comenzar</button></section>;
}

export function RunResults({ game, difficulty, exit }: { game: ArcadeGame; difficulty: string; exit: () => void }) {
  const survival = game.runKind === 'survival';
  const score = game.heroes.reduce((sum, hero) => sum + hero.score, 0);
  const records = survival ? survivalRecords(game.coop, difficulty) : [];
  return <section className="run-screen run-results" aria-label="Resultados de la partida"><div className="run-heading"><span className="title-eyebrow">{survival ? 'SUPERVIVENCIA / RESULTADO FINAL' : 'CAMINO DE LOS DIOSES / RESULTADO FINAL'}</span><h2>{survival ? `Oleada ${game.completedWaves}` : game.phase === 'victory' ? 'El destino está en sus manos' : 'El camino termina aquí'}</h2><p>{game.heroes.map(hero => hero.deity.name).join(' y ')} · {difficulty}</p></div>
    <div className="run-result-body"><div className="run-score"><b>{survival ? game.completedWaves : game.finalGrade}</b><span>{survival ? 'OLEADAS SUPERADAS' : 'RANGO GLOBAL'}</span><strong>{score.toLocaleString('es-MX')} puntos</strong></div>
    <div className="run-stats">{[['Enemigos comunes', game.totals.kills - game.totals.minis], ['Minijefes', game.totals.minis], ['Jefes', game.totals.bosses], ['Total derrotados', game.totals.kills + game.totals.bosses], ['Tiempo', `${Math.floor(game.elapsedSeconds / 60)}:${String(game.elapsedSeconds % 60).padStart(2, '0')}`], ['Caídas', game.totals.deaths], ['Continuaciones', game.totals.continues], ['Rescates', game.totals.rescues]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="run-breakdown">{survival ? <><h3>Récords / {game.coop ? 'Cooperativo' : 'Solitario'} / {difficulty}</h3>{records.map((record, i) => <div key={`${record.date}-${i}`}><span>{i + 1}. {record.characters.map(id => DEITIES.find(deity => deity.id === id)?.name ?? id).join(' y ')}</span><strong>Oleada {record.wave} · {record.score.toLocaleString('es-MX')}</strong></div>)}<small>Récords guardados en este dispositivo.</small></> : <><h3>El recorrido completo</h3>{game.history.map((stage, i) => <div key={i}><span>{i + 1}. {stage.realm} · {stage.boss}</span><strong>{stage.players.map(player => gradeLetter(player.grade)).join(' / ')}</strong></div>)}<small>El rango global promedia los valores de desempeño de todas las etapas.</small></>}</div></div>
    <button className="arena-confirm" onClick={exit}>Volver al menú</button></section>;
}
