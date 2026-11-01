import { ARENAS } from '../game/arenas';
import { validRoute } from '../arcade/run';
import type { RouteStop } from '../arcade/run';
import type { ArcadeInput } from '../arcade/engine';
import type { Difficulty } from '../game/core';

export const LAN_VERSION = 5;
export const EMPTY_LAN_INPUT: ArcadeInput = { left: false, right: false, up: false, down: false, attack: false, jump: false, magic: false, tapLeft: false, tapRight: false };
export function readLanInput(value: unknown): ArcadeInput {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.keys(EMPTY_LAN_INPUT).map(key => [key, record[key] === true])) as unknown as ArcadeInput;
}
export interface LanStart { deities: string[]; difficulty: Difficulty; mode?: 'arcade' | 'survival' | 'versus'; route?: RouteStop[]; arena?: number }
export function readLanStart(value: unknown, ids: readonly string[]): LanStart | null {
  const data = value as Partial<LanStart> | null;
  if (!data || !Array.isArray(data.deities) || (data.deities.length < 2 || data.deities.length > 4 || data.mode === 'versus' && data.deities.length !== 2) || !data.deities.every(id => typeof id === 'string' && ids.includes(id)) || !['FACIL', 'NORMAL', 'DIFICIL'].includes(data.difficulty ?? '')) return null;
  if (data.mode !== undefined && !['arcade', 'survival', 'versus'].includes(data.mode)) return null;
  if (data.route !== undefined && !validRoute(data.route, data.deities)) return null;
  if (data.arena !== undefined && (!Number.isInteger(data.arena) || data.arena < 0 || data.arena >= ARENAS.length)) return null;
  return { mode: data.mode ?? 'arcade', route: data.route, arena: data.arena ?? 0, deities: [...data.deities] as string[], difficulty: data.difficulty! };
}
// Una invitación contiene dirección local, puerto efímero y secreto de la sala.
export function readLanInvite(text: string) {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})#([a-f0-9]{32})$/.exec(text.trim());
  if (!match) return null;
  const octets = match[1].split('.').map(Number), port = Number(match[2]);
  const local = octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
  if (!local || octets.some(n => n > 255) || port < 1024 || port > 65535) return null;
  return { host: match[1], port, token: match[3] };
}
