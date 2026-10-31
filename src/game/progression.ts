// La maestría reconoce el juego sin dar ventajas estadísticas ni bloquear dioses.
export interface Mastery { wins: number; clears: number; bestCombo: number; bestRank: string }
const KEY = 'mythic-clash-mastery-v1';
const empty = (): Mastery => ({ wins: 0, clears: 0, bestCombo: 0, bestRank: '' });
export function readMastery(id: string): Mastery {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')[id];
    const count = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    return { wins: count(value?.wins), clears: count(value?.clears), bestCombo: count(value?.bestCombo), bestRank: ['C', 'B', 'A', 'S'].includes(value?.bestRank) ? value.bestRank : '' };
  } catch { return empty(); }
}
export function awardMastery(id: string, result: Partial<Mastery>) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const all = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    const old = readMastery(id);
    const ranks = ['', 'C', 'B', 'A', 'S'];
    all[id] = {
      wins: old.wins + (result.wins ?? 0), clears: old.clears + (result.clears ?? 0),
      bestCombo: Math.max(old.bestCombo, result.bestCombo ?? 0),
      bestRank: ranks[Math.max(ranks.indexOf(old.bestRank), ranks.indexOf(result.bestRank ?? ''))]
    };
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* Jugar sigue siendo posible con almacenamiento deshabilitado. */ }
}
export function masteryTitle(m: Mastery) {
  const marks = m.wins + m.clears * 3;
  return marks >= 30 ? 'Leyenda' : marks >= 12 ? 'Ascendente' : marks >= 3 ? 'Iniciado' : 'Sin rango';
}
