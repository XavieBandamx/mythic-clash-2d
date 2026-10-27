import { useEffect, useRef } from 'react';
import type { DeityData } from '../game/deities';
import { SIM_STEP_MS } from '../game/core';
import type { Difficulty } from '../game/core';
import { sounds } from '../game/sound';
import { ArcadeGame } from './engine';
import type { ArcadeInput } from './engine';
import { VIEW_H, VIEW_W } from './draw';

interface ArcadeModeProps {
  deity: DeityData;
  difficulty: Difficulty;
  onExit: () => void;
}

const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

// ==========================================================================
// COMPONENTE DEL MODO ARCADE: canvas propio, teclado y bucle a paso fijo
// ==========================================================================
export default function ArcadeMode({ deity, difficulty, onExit }: ArcadeModeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const game = new ArcadeGame(deity, difficulty);
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
        if (game.phase === 'gameOver' || game.phase === 'victory') exit();
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

    const readInput = (): ArcadeInput => {
      const isHeld = (...codes: string[]) => codes.some(c => held.has(c));
      const wasPressed = (...codes: string[]) => codes.some(c => pressed.has(c));
      return {
        left: isHeld('KeyA', 'ArrowLeft'),
        right: isHeld('KeyD', 'ArrowRight'),
        up: isHeld('KeyW', 'ArrowUp'),
        down: isHeld('KeyS', 'ArrowDown'),
        attack: wasPressed('KeyJ'),
        jump: wasPressed('KeyK', 'Space'),
        magic: wasPressed('KeyL'),
        tapLeft: wasPressed('KeyA', 'ArrowLeft'),
        tapRight: wasPressed('KeyD', 'ArrowRight')
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
        game.step(readInput());
        pressed.clear(); // Cada pulsación se consume en un solo paso
        accumulator -= SIM_STEP_MS;
      }
      game.render(ctx);
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
  }, [deity, difficulty]);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        className="w-full h-full max-w-[1400px] max-h-[787px] object-contain shadow-2xl bg-black"
      />
    </div>
  );
}
