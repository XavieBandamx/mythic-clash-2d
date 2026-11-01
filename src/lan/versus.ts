import type { Fighter } from '../App';
import type { MatchFlow } from '../game/match';

type Scalar = string | number | boolean | null;
export interface VersusState { fighters: Record<string, Scalar>[]; flow: Record<string, Scalar | number[]>; timer: number; frame: number; shake: number; cinematic: { caster: 1 | 2; timer: number } | null }
export interface VersusInput { left: boolean; right: boolean; up: boolean; down: boolean; light: boolean; heavy: boolean; special: boolean; heavyTap?: boolean }
export const EMPTY_VERSUS_INPUT: VersusInput = { left: false, right: false, up: false, down: false, light: false, heavy: false, special: false, heavyTap: false };
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

// Las claves de los dos luchadores viajan una sola vez por cuadro.
export interface CompactVersusState { keys: string[]; fighters: Scalar[][]; flow: VersusState['flow']; timer: number; frame: number; shake: number; cinematic: VersusState['cinematic'] }
export function compactVersus(value: VersusState): CompactVersusState {
  const keys = Object.keys(value.fighters[0]);
  return { ...value, keys, fighters: value.fighters.map(fighter => keys.map(key => fighter[key] ?? null)) };
}
export function expandVersus(value: CompactVersusState): VersusState {
  if (!value || !Array.isArray(value.keys) || value.keys.length > 200 || !value.keys.every(key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key)) || !Array.isArray(value.fighters) || value.fighters.length !== 2 || !value.fighters.every(fighter => Array.isArray(fighter) && fighter.length === value.keys.length && fighter.every(item => item === null || typeof item === 'boolean' || typeof item === 'string' || typeof item === 'number' && Number.isFinite(item)))) throw new Error('Estado de duelo inválido');
  return { ...value, fighters: value.fighters.map(fighter => Object.fromEntries(value.keys.map((key, index) => [key, fighter[index]]))) };
}

export class VersusMotion {
  private poses: { fighter: Fighter; x: number; y: number; targetX: number; targetY: number; duration: number }[] = [];
  private receivedAt = 0;
  private interval = 1000 / 30;
  constructor(private now = () => performance.now()) {}
  apply(fighters: Fighter[], states: Record<string, Scalar>[], reset = false) {
    const now = this.now();
    this.smooth(now);
    if (this.receivedAt && !reset) this.interval = Math.max(16, Math.min(60, this.interval * .75 + (now - this.receivedAt) * .25));
    this.poses = fighters.map((fighter, index) => {
      const x = fighter.x, y = fighter.y; applyFighterState(fighter, states[index]);
      // El invitado controla a P2: su desplazamiento visual alcanza antes al estado real.
      const snap = reset || Math.abs(fighter.x - x) > 260 || Math.abs(fighter.y - y) > 180;
      return { fighter, x: snap ? fighter.x : x, y: snap ? fighter.y : y, targetX: fighter.x, targetY: fighter.y, duration: index === 1 ? Math.min(24, this.interval * .5) : this.interval };
    });
    this.receivedAt = now;
  }
  smooth(now: number) {
    for (const pose of this.poses) {
      const mix = Math.min(1, Math.max(0, (now - this.receivedAt) / pose.duration));
      pose.fighter.x = pose.x + (pose.targetX - pose.x) * mix; pose.fighter.y = pose.y + (pose.targetY - pose.y) * mix;
    }
  }
}
