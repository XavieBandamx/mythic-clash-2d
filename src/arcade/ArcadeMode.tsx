import { useEffect, useRef, useState } from 'react';
import type { DeityData } from '../game/deities';
import { SIM_STEP_MS } from '../game/core';
import type { Difficulty } from '../game/core';
import { sounds } from '../game/sound';
import { ArcadeGame } from './engine';
import type { ArcadeInput } from './engine';
import { VIEW_H, VIEW_W } from './draw';

interface ArcadeModeProps {
  deities: DeityData[]; // Uno por jugador: con dos se juega en cooperativo
  difficulty: Difficulty;
  onExit: () => void;
}

interface KeyMap {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  attack: string[];
  jump: string[];
  magic: string[];
}

// Un jugador: WASD o flechas. Cooperativo: 1P con WASD + J/K/L, 2P con flechas + teclado numérico
// (o , . - en laptops sin teclado numérico)
const SOLO_KEYS: KeyMap = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  attack: ['KeyJ'],
  jump: ['KeyK', 'Space'],
  magic: ['KeyL']
};
const COOP_KEYS: KeyMap[] = [
  { ...SOLO_KEYS, left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'] },
  {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    attack: ['Numpad1', 'Comma'],
    jump: ['Numpad2', 'Period'],
    magic: ['Numpad3', 'Slash']
  }
];

const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Quote'];

// ==========================================================================
// COMPONENTE DEL MODO ARCADE: canvas propio, teclado y bucle a paso fijo
// ==========================================================================
export default function ArcadeMode({ deities, difficulty, onExit }: ArcadeModeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  // Fase de la partida para mostrar botones tocables encima del canvas (continuar, volver al menú)
  const gameRef = useRef<ArcadeGame | null>(null);
  const [phase, setPhase] = useState<ArcadeGame['phase']>('play');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const game = new ArcadeGame(deities, difficulty);
    gameRef.current = game;
    let shownPhase = game.phase;
    const keyMaps = deities.length > 1 ? COOP_KEYS : [SOLO_KEYS];
    const held = new Set<string>();
    const pressed = new Set<string>(); // Pulsadas desde el último paso de simulación
    let exited = false;

    const exit = () => {
      if (exited) return;
      exited = true;
      onExitRef.current();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (GAME_KEYS.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      held.add(e.code);
      pressed.add(e.code);

      if (e.code === 'Escape') {
        if (game.phase === 'gameOver' || game.phase === 'finalOver' || game.phase === 'victory') exit();
        else {
          game.paused = !game.paused;
          sounds.playNav();
        }
      } else if (e.code === 'KeyQ' && game.paused) {
        exit();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      held.delete(e.code);
    };
    const handleBlur = () => held.clear();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    const readInput = (keys: KeyMap): ArcadeInput => {
      const isHeld = (codes: string[]) => codes.some(c => held.has(c));
      const wasPressed = (codes: string[]) => codes.some(c => pressed.has(c));
      return {
        left: isHeld(keys.left),
        right: isHeld(keys.right),
        up: isHeld(keys.up),
        down: isHeld(keys.down),
        attack: wasPressed(keys.attack),
        jump: wasPressed(keys.jump),
        magic: wasPressed(keys.magic),
        tapLeft: wasPressed(keys.left),
        tapRight: wasPressed(keys.right)
      };
    };

    sounds.playBGM('BATTLE');

    let animId = 0;
    let lastTime = performance.now();
    let accumulator = 0;
    const loop = (now: number) => {
      accumulator += Math.min(now - lastTime, 250);
      lastTime = now;
      while (accumulator >= SIM_STEP_MS) {
        game.step(keyMaps.map(readInput));
        pressed.clear(); // Cada pulsación se consume en un solo paso
        accumulator -= SIM_STEP_MS;
      }
      game.render(ctx);
      if (game.phase !== shownPhase) {
        shownPhase = game.phase;
        setPhase(game.phase);
      }
      if (game.exitRequested) {
        exit();
        return;
      }
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
    // La lista se recrea en cada render de App: se reinicia la partida solo si cambian los dioses
  }, [deities.map(d => d.id).join(','), difficulty]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black pt-12 sm:pt-14">
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        className="w-full h-full max-w-[1400px] max-h-[787px] object-contain portrait:object-top shadow-2xl bg-black"
      />
      {(phase === 'gameOver' || phase === 'finalOver' || phase === 'victory') && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[20%] portrait:bottom-auto portrait:top-[42%] z-30 flex gap-3">
          {phase === 'gameOver' && (
            <button
              onClick={() => gameRef.current?.continueGame()}
              className="px-8 py-4 rounded-xl font-black text-lg bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 shadow-lg shadow-amber-900/50 animate-pulse"
            >
              ¡CONTINUAR!
            </button>
          )}
          <button
            onClick={() => onExitRef.current()}
            className="px-5 py-4 rounded-xl font-bold bg-slate-800/90 text-slate-200 border border-slate-600"
          >
            {phase === 'gameOver' ? 'Salir' : 'Volver al menú'}
          </button>
        </div>
      )}
    </div>
  );
}
