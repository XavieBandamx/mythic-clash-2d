import { LEVELS } from './levels';

export interface RouteStop { realm: number; boss: string }
export type RunKind = 'arcade' | 'survival';
export interface RunStage { realm: string; boss: string; secs: number; players: { id: string; kills: number; deaths: number; combo: number; grade: number }[] }
export const gradePoints = (deaths: number, secs: number, combo: number) => (deaths === 0 ? 2 : deaths === 1 ? 1 : 0) + (secs < 150 ? 2 : secs < 210 ? 1 : 0) + (combo >= 25 ? 2 : combo >= 12 ? 1 : 0);
export const gradeLetter = (points: number) => points >= 5 ? 'S' : points >= 3 ? 'A' : points >= 1 ? 'B' : 'C';
const ROUTE_KEY = 'mythic-clash-recent-route';
export function createRoute(players: string[], random = Math.random, remember = true): RouteStop[] {
  let previous: RouteStop[] = [];
  try { const data = JSON.parse(localStorage.getItem(ROUTE_KEY) ?? '[]'); if (Array.isArray(data)) previous = data.filter(stop => stop && Number.isInteger(stop.realm) && typeof stop.boss === 'string'); } catch { /* Almacenamiento opcional. */ }
  const realms = LEVELS.map((_, index) => index);
  for (let i = realms.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [realms[i], realms[j]] = [realms[j], realms[i]]; }
  if (realms[0] === previous[0]?.realm) [realms[0], realms[1]] = [realms[1], realms[0]];
  const route = realms.map(realm => {
    const candidates = LEVELS[realm].bossOrder.filter(id => !players.includes(id));
    const fresh = candidates.filter(id => id !== previous.find(stop => stop.realm === realm)?.boss);
    const pool = fresh.length ? fresh : candidates;
    return { realm, boss: pool[Math.floor(random() * pool.length)] ?? LEVELS[realm].bossOrder[0] };
  });
  if (remember) try { localStorage.setItem(ROUTE_KEY, JSON.stringify(route)); } catch { /* Almacenamiento opcional. */ }
  return route;
}
export function validRoute(value: unknown, players: string[]): value is RouteStop[] {
  return Array.isArray(value) && value.length === LEVELS.length && new Set(value.map(stop => stop?.realm)).size === LEVELS.length && value.every(stop => Number.isInteger(stop?.realm) && LEVELS[stop.realm]?.bossOrder.includes(stop.boss) && (!players.includes(stop.boss) || LEVELS[stop.realm].bossOrder.every(id => players.includes(id))));
}
export interface SurvivalRecord { characters: string[]; wave: number; score: number; difficulty: string; date: string }
const RECORD_KEY = 'mythic-clash-survival-records-v1';
export function survivalRecords(coop: boolean, difficulty: string): SurvivalRecord[] {
  try { const data = JSON.parse(localStorage.getItem(RECORD_KEY) ?? '[]'); return Array.isArray(data) ? data.filter(row => Array.isArray(row.characters) && (row.characters.length > 1) === coop && row.difficulty === difficulty && Number.isFinite(row.wave) && Number.isFinite(row.score)).sort((a, b) => b.wave - a.wave || b.score - a.score).slice(0, 10) : []; } catch { return []; }
}
export function saveSurvivalRecord(record: SurvivalRecord) {
  const all = ['FACIL', 'NORMAL', 'DIFICIL'].flatMap(difficulty => [false, true].flatMap(coop => survivalRecords(coop, difficulty)));
  all.push(record); all.sort((a, b) => b.wave - a.wave || b.score - a.score);
  const counts = new Map<string, number>();
  const kept = all.filter(row => { const key = `${row.difficulty}/${row.characters.length > 1}`; const count = (counts.get(key) ?? 0) + 1; counts.set(key, count); return count <= 10; });
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(kept)); } catch { /* El resultado sigue visible sin almacenamiento. */ }
}
