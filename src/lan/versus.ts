import type { Fighter } from '../App';
import type { MatchFlow } from '../game/match';

type Scalar = string | number | boolean | null;
export interface VersusState { fighters: Record<string, Scalar>[]; flow: Record<string, Scalar | number[]>; timer: number; frame: number; shake: number; cinematic: { caster: 1 | 2; timer: number } | null }
export interface VersusInput { left: boolean; right: boolean; up: boolean; down: boolean; light: boolean; heavy: boolean; special: boolean }
export const EMPTY_VERSUS_INPUT: VersusInput = { left: false, right: false, up: false, down: false, light: false, heavy: false, special: false };
export function readVersusInput(value: unknown): VersusInput { const data = value && typeof value === 'object' ? value as Record<string, unknown> : {}; return Object.fromEntries(Object.keys(EMPTY_VERSUS_INPUT).map(key => [key, data[key] === true])) as unknown as VersusInput; }
export function fighterState(fighter: Fighter): Record<string, Scalar> {
  return Object.fromEntries(Object.entries(fighter).filter(([key, value]) => key !== 'isAI' && (value === null || ['string', 'number', 'boolean'].includes(typeof value))));
}
export function applyFighterState(fighter: Fighter, state: Record<string, Scalar>) {
  // Solo propiedades escalares propias: nunca recursos, métodos ni prototipos.
  for (const [key, value] of Object.entries(state)) {
    if (key === 'isAI' || !Object.prototype.hasOwnProperty.call(fighter, key)) continue;
    const current = (fighter as unknown as Record<string, unknown>)[key];
    if (current !== null && !['string', 'number', 'boolean'].includes(typeof current)) continue;
    if (value !== null && !['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)) continue;
    (fighter as unknown as Record<string, unknown>)[key] = value;
  }
}
export function applyFlow(flow: MatchFlow, state: VersusState['flow']) {
  if (!['intro', 'fight', 'ko', 'complete'].includes(String(state.phase)) || !Array.isArray(state.wins) || state.wins.length !== 2) throw new Error('Marcador inválido');
  flow.phase = state.phase as MatchFlow['phase']; flow.wins = state.wins as [number, number];
  flow.elapsed = Number(state.elapsed); flow.round = Number(state.round); flow.roundWinner = state.roundWinner === 1 || state.roundWinner === 2 ? state.roundWinner : null;
  flow.reason = state.reason === 'time' ? 'time' : 'ko';
}

export class VersusMotion {
  private poses: { fighter: Fighter; x: number; y: number; targetX: number; targetY: number }[] = [];
  private receivedAt = 0;
  apply(fighters: Fighter[], states: Record<string, Scalar>[], reset = false) {
    this.poses = fighters.map((fighter, index) => {
      const x = fighter.x, y = fighter.y; applyFighterState(fighter, states[index]);
      return { fighter, x: reset ? fighter.x : x, y: reset ? fighter.y : y, targetX: fighter.x, targetY: fighter.y };
    });
    this.receivedAt = performance.now();
  }
  smooth(now: number) {
    const mix = Math.min(1, Math.max(0, (now - this.receivedAt) / 50));
    for (const pose of this.poses) { pose.fighter.x = pose.x + (pose.targetX - pose.x) * mix; pose.fighter.y = pose.y + (pose.targetY - pose.y) * mix; }
  }
}
