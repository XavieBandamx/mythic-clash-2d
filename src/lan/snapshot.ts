import { ArcadeGame, Hero, Monster, Boss, Beast } from '../arcade/engine';
import { BEASTS, ORIGEN } from '../arcade/levels';
import { DEITIES } from '../game/deities';
import type { MonsterKind, MonsterSkin } from '../arcade/levels';

type Ref = { r: number };
type Value = null | string | number | boolean | Ref;
interface Node { id: number; type: string; meta?: unknown[]; fields: Record<string, Value>; values?: Value[] }
export interface ArcadeSnapshot { version: 1; level: number; nodes: Node[]; root: Ref }
const SKIP = new Set(['cfg', 'sheet', 'extraCfg', 'extraSheet', 'sprite', 'art', 'props', 'waves', 'pending', 'deity', 'stats', 'skin', 'def', 'bossDeity']);
const GAME_KEYS = new Set(['heroes', 'monsters', 'beasts', 'boss', 'orbs', 'thunders', 'items', 'scenery', 'hazards', 'particles', 'camX', 'tick', 'relicChoice', 'relicChoices', 'relicCursors', 'relicCursor', 'rescues', 'lifeLossQueue', 'phase', 'paused', 'continueTimer', 'phaseTimer', 'banner', 'goTimer', 'results', 'record', 'magicCast', 'coopLink', 'coopGuard', 'coopFeedback', 'levelStartTick', 'coop', 'exitRequested', 'shakeTicks', 'shakeIntensity', 'shakeDuration']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

// Solo el anfitrión simula. La copia remota recibe estado visual, nunca imágenes ni entradas ajenas.
export class SnapshotWriter {
  private ids = new WeakMap<object, number>();
  private next = 1;
  capture(game: ArcadeGame): ArcadeSnapshot {
    const nodes: Node[] = [], visited = new Set<number>();
    const encode = (value: unknown): Value => {
      if (value === null || value === undefined) return null;
      if (typeof value === 'boolean' || typeof value === 'string') return value;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      if (typeof value !== 'object') return null;
      let id = this.ids.get(value);
      if (!id) { id = this.next++; this.ids.set(value, id); }
      if (visited.has(id)) return { r: id };
      visited.add(id);
      const node: Node = { id, type: 'object', fields: {} }; nodes.push(node);
      if (value instanceof ArcadeGame) node.type = 'game';
      else if (value instanceof Hero) { node.type = 'hero'; node.meta = [value.deity.id, value.index]; }
      else if (value instanceof Monster) { node.type = 'monster'; node.meta = [value.kind, value.skin]; }
      else if (value instanceof Boss) { node.type = 'boss'; node.meta = [value.deity.id]; }
      else if (value instanceof Beast) { node.type = 'beast'; node.meta = [value.def.id]; }
      else if (Array.isArray(value)) { node.type = 'array'; node.values = value.map(encode); return { r: id }; }
      else if (value instanceof Map) { node.type = 'map'; node.values = [...value.entries()].flatMap(([key, item]) => [encode(key), encode(item)]); return { r: id }; }
      else if (value instanceof Set) { node.type = 'set'; node.values = [...value].map(encode); return { r: id }; }
      for (const [key, item] of Object.entries(value)) {
        if (FORBIDDEN.has(key) || SKIP.has(key) || value instanceof ArcadeGame && !GAME_KEYS.has(key)) continue;
        node.fields[key] = encode(key === 'particles' && Array.isArray(item) ? item.slice(-160) : item);
      }
      return { r: id };
    };
    return { version: 1, level: game.levelIndex, root: encode(game) as Ref, nodes };
  }
}

export class SnapshotReader {
  private actors = new Map<number, Hero | Monster | Boss | Beast>();
  private motion: { actor: Hero | Monster | Boss | Beast; from: number[]; to: number[] }[] = [];
  private receivedAt = 0;
  private camera = { game: null as ArcadeGame | null, from: 0, to: 0 };
  smooth(now: number) {
    const mix = Math.min(1, Math.max(0, (now - this.receivedAt) / 50));
    for (const pose of this.motion) {
      pose.actor.x = pose.from[0] + (pose.to[0] - pose.from[0]) * mix;
      pose.actor.z = pose.from[1] + (pose.to[1] - pose.from[1]) * mix;
      pose.actor.y = pose.from[2] + (pose.to[2] - pose.from[2]) * mix;
    }
    if (this.camera.game) this.camera.game.camX = this.camera.from + (this.camera.to - this.camera.from) * mix;
  }
  apply(game: ArcadeGame, raw: ArcadeSnapshot) {
    if (!raw || raw.version !== 1 || !Number.isInteger(raw.level) || raw.level < 0 || raw.level > 4 || !Array.isArray(raw.nodes) || raw.nodes.length > 12000) throw new Error('Estado de partida inválido');
    const sameLevel = raw.level === game.levelIndex;
    const previous = sameLevel ? new Map([...this.actors].map(([id, actor]) => [id, [actor.x, actor.z, actor.y]])) : new Map<number, number[]>();
    const oldCamera = game.camX;
    game.prepareRemoteLevel(raw.level);
    const objects = new Map<number, unknown>(), currentActors = new Map<number, Hero | Monster | Boss | Beast>();
    const deity = (id: unknown) => DEITIES.find(item => item.id === id) ?? (id === ORIGEN.id ? ORIGEN : null);
    for (const node of raw.nodes) {
      if (!Number.isSafeInteger(node.id) || objects.has(node.id) || !node.fields || typeof node.fields !== 'object') throw new Error('Referencia de partida inválida');
      const meta = node.meta ?? []; let value: unknown;
      if (['hero', 'monster', 'boss', 'beast'].includes(node.type)) {
        value = this.actors.get(node.id);
        if (!value) {
          if (node.type === 'hero' && deity(meta[0]) && (meta[1] === 0 || meta[1] === 1)) value = new Hero(deity(meta[0])!, Number(meta[1]));
          else if (node.type === 'boss' && deity(meta[0])) value = new Boss(deity(meta[0])!, 0, 0, 1, 1, 0);
          else if (node.type === 'monster' && ['grunt', 'brute', 'runner', 'thief', 'mini'].includes(String(meta[0])) && meta[1] && typeof meta[1] === 'object') value = new Monster(meta[0] as MonsterKind, meta[1] as MonsterSkin, 0, 0, 1, 1);
          else if (node.type === 'beast') { const def = Object.values(BEASTS).find(item => item.id === meta[0]); if (def) value = new Beast(def, 0, 0); }
        }
        if (!(node.type === 'hero' && value instanceof Hero || node.type === 'monster' && value instanceof Monster || node.type === 'boss' && value instanceof Boss || node.type === 'beast' && value instanceof Beast)) throw new Error('Actor de partida inválido');
        currentActors.set(node.id, value);
      } else if (node.type === 'game') value = game;
      else if (node.type === 'array') value = [];
      else if (node.type === 'map') value = new Map();
      else if (node.type === 'set') value = new Set();
      else if (node.type === 'object') value = {};
      else throw new Error('Tipo de partida inválido');
      objects.set(node.id, value);
    }
    const decode = (value: Value): unknown => {
      if (value && typeof value === 'object') { if (!objects.has(value.r)) throw new Error('Referencia inexistente'); return objects.get(value.r); }
      return value;
    };
    if (objects.get(raw.root?.r) !== game) throw new Error('Raíz de partida inválida');
    for (const node of raw.nodes) {
      const value = objects.get(node.id) as Record<string, unknown>;
      if (node.type === 'array') (value as unknown as unknown[]).push(...(node.values ?? []).map(decode));
      else if (node.type === 'map') {
        const entries = node.values ?? [];
        if (entries.length % 2) throw new Error('Mapa de partida inválido');
        for (let i = 0; i < entries.length; i += 2) (value as unknown as Map<unknown, unknown>).set(decode(entries[i]), decode(entries[i + 1]));
      } else if (node.type === 'set') for (const item of node.values ?? []) (value as unknown as Set<unknown>).add(decode(item));
      else for (const [key, item] of Object.entries(node.fields)) {
        if (FORBIDDEN.has(key) || SKIP.has(key) || node.type === 'game' && !GAME_KEYS.has(key)) continue;
        if (['hero', 'monster', 'boss', 'beast'].includes(node.type) && !Object.prototype.hasOwnProperty.call(value, key)) continue;
        value[key] = decode(item);
      }
    }
    this.actors = currentActors;
    this.motion = [...currentActors].filter(([id]) => previous.has(id)).map(([id, actor]) => ({ actor, from: previous.get(id)!, to: [actor.x, actor.z, actor.y] }));
    this.receivedAt = performance.now();
    this.camera = { game, from: sameLevel ? oldCamera : game.camX, to: game.camX };
  }
}
