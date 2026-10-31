import { useEffect, useRef, useState } from 'react';
import type { DeityData } from '../game/deities';
import { SIM_STEP_MS } from '../game/core';
import type { Difficulty } from '../game/core';
import { sounds } from '../game/sound';
import { ArcadeGame } from './engine';
import type { ArcadeInput } from './engine';
import { VIEW_H, VIEW_W } from './draw';
import TouchControls from '../TouchControls';
import BlessingMenu from './BlessingMenu';

interface ArcadeModeProps {
  deities: DeityData[]; // Uno por jugador: con dos se juega en cooperativo
  difficulty: Difficulty;
  onExit: () => void;
  touch?: boolean;
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
export default function ArcadeMode({ deities, difficulty, onExit, touch = false }: ArcadeModeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  // Fase de la partida para mostrar botones tocables encima del canvas (continuar, volver al menú)
  const gameRef = useRef<ArcadeGame | null>(null);
  const [phase, setPhase] = useState<ArcadeGame['phase']>('play');
  const [relic, setRelic] = useState<number | null>(null);
  const [showRelics, setShowRelics] = useState(false);
  const [relicCursor, setRelicCursor] = useState(0);
  const [lifeMessage, setLifeMessage] = useState('');
  const [mobileHud, setMobileHud] = useState({ hp: 100, maxHp: 100, lives: 3, magic: 2, realm: 'Grecia', background: 'grecia-fondo.webp' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const game = new ArcadeGame(deities, difficulty);
    gameRef.current = game;
    let shownPhase = game.phase;
    let shownRelic = game.relicChoice;
    let shownRelics = false;
    let shownCursor = 0;
    let shownLifeMessage = '';
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
      if (game.phase === 'levelClear' && /^Digit[123]$/.test(e.code)) {
        game.chooseRelic(Number(e.code.slice(-1)) - 1);
        return;
      }
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
    let lastHud = 0;
    const loop = (now: number) => {
      accumulator += Math.min(now - lastTime, 250);
      lastTime = now;
      while (accumulator >= SIM_STEP_MS) {
        game.step(keyMaps.map(readInput));
        pressed.clear(); // Cada pulsación se consume en un solo paso
        accumulator -= SIM_STEP_MS;
      }
      game.render(ctx);
      // El HUD legible de la consola vertical se actualiza sin cambiar la simulación.
      if (now - lastHud >= 200) {
        lastHud = now;
        const hero = game.heroes[0];
        const next = { hp: Math.max(0, Math.ceil(hero.hp)), maxHp: hero.maxHp, lives: hero.lives, magic: hero.magic,
          realm: game.level.pantheon ?? 'El encuentro final', background: game.level.art?.background ?? 'grecia-fondo.webp' };
        setMobileHud(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
      }
      const loss = game.lifeLoss;
      const message = loss ? `${loss.hero.deity.name} ha caído. ${loss.remaining} vidas restantes.` : '';
      if (message !== shownLifeMessage) { shownLifeMessage = message; setLifeMessage(message); }
      const offerRelics = game.relicOfferReady;
      if (offerRelics !== shownRelics) { shownRelics = offerRelics; setShowRelics(offerRelics); }
      if (shownRelic !== game.relicChoice) { shownRelic = game.relicChoice; setRelic(game.relicChoice); }
      if (shownCursor !== game.relicCursor) { shownCursor = game.relicCursor; setRelicCursor(game.relicCursor); }
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
    <div className={`arcade-screen ${touch ? 'arcade-touch' : ''}`}>
      {touch && <img className="arcade-ambient" src={`${import.meta.env.BASE_URL}backgrounds/${mobileHud.background}`} alt="" />}
      <div className="arcade-console">
      {touch && <div className="arcade-mobile-hud">
        <div><span>CAMINO DE LOS DIOSES / {mobileHud.realm}</span><strong>{deities[0].name}</strong></div>
        <div className="arcade-mobile-health"><span>VIDA <b>{mobileHud.hp} / {mobileHud.maxHp}</b></span><progress value={mobileHud.hp} max={mobileHud.maxHp} aria-label="Vida del jugador 1" /></div>
        <div className="arcade-mobile-resources"><span><b>{mobileHud.lives}</b> VIDAS</span><span><b>{mobileHud.magic}</b> MAGIA</span></div>
      </div>}
      <div className="arcade-viewport">
      <canvas
        ref={canvasRef}
        width={VIEW_W}
        height={VIEW_H}
        className="arcade-canvas"
      />
      </div>
      {touch && !showRelics && (phase === 'play' || phase === 'boss' || phase === 'bossIntro') && <TouchControls mode="arcade" docked />}
      </div>
      <div className="sr-only" role="status" aria-live="assertive">{lifeMessage}</div>
      {showRelics && <BlessingMenu choice={relic} cursor={relicCursor} coop={deities.length > 1} choose={index => gameRef.current?.chooseRelic(index)} />}
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
