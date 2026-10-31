import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { CANONICAL, getControls, sendKey } from './game/controls';
import type { ControlAction } from './game/controls';
import { sounds } from './game/sound';

type Dir = 'up' | 'down' | 'left' | 'right';
const STICK = 128;       // Diámetro del joystick a tamaño normal
const DEADZONE = 0.35;   // Fracción del radio antes de contar una dirección
const SIZES = { chico: 0.8, normal: 1, grande: 1.3 };

// Si el navegador no deja capturar el dedo, el botón igual debe funcionar
const capture = (e: ReactPointerEvent<HTMLElement>) => {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Sin captura: soltar fuera del botón no lo liberará, pero sí se presiona
  }
};

const press = (action: ControlAction, down: boolean) => CANONICAL[0][action].forEach(vk => sendKey(down ? 'keydown' : 'keyup', vk));

// ==========================================================================
// CONTROLES TÁCTILES: joystick y botones que se mantienen presionados.
// Mandan las teclas del jugador 1, así sirven igual en versus, arcade y torre.
// ==========================================================================
export default function TouchControls({ mode, docked = false }: { mode: 'versus' | 'arcade'; docked?: boolean }) {
  const { touchSize, touchSwap } = getControls();
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const scale = docked && viewport.height > viewport.width
    ? Math.min(SIZES[touchSize], Math.max(.65, (viewport.width - 64) / 256))
    : docked && viewport.width < 900 ? Math.min(SIZES[touchSize], 1) : SIZES[touchSize];
  const radius = (STICK * scale) / 2;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const held = useRef(new Set<Dir>());
  const activeButtons = useRef(new Set<ControlAction | 'spin'>());
  const sentActions = useRef(new Set<ControlAction>());
  const syncActions = () => {
    const next = new Set<ControlAction>(held.current);
    for (const action of activeButtons.current) {
      if (action === 'spin') { next.add('light'); next.add('heavy'); }
      else next.add(action);
    }
    for (const action of sentActions.current) if (!next.has(action)) press(action, false);
    for (const action of next) if (!sentActions.current.has(action)) press(action, true);
    sentActions.current = next;
  };
  useEffect(() => {
    const release = () => {
      for (const action of sentActions.current) press(action, false);
      held.current.clear(); activeButtons.current.clear();
      sentActions.current.clear();
      setKnob({ x: 0, y: 0 });
    };
    window.addEventListener('blur', release);
    return () => { release(); window.removeEventListener('blur', release); };
  }, [mode]);
  const buttonPress = (action: ControlAction | 'spin', down: boolean) => {
    if (down) activeButtons.current.add(action); else activeButtons.current.delete(action);
    syncActions();
  };

  const setDirs = (next: Set<Dir>) => {
    held.current = next;
    syncActions();
  };

  const moveStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > radius) {
      dx = (dx / len) * radius;
      dy = (dy / len) * radius;
    }
    setKnob({ x: dx, y: dy });
    const next = new Set<Dir>();
    if (dx < -radius * DEADZONE) next.add('left');
    if (dx > radius * DEADZONE) next.add('right');
    if (dy < -radius * DEADZONE) next.add('up');
    if (dy > radius * DEADZONE) next.add('down');
    setDirs(next);
  };

  const releaseStick = () => {
    setKnob({ x: 0, y: 0 });
    setDirs(new Set());
  };

  // Cuadro de 2x2: el botón más usado queda abajo a la derecha, bajo el pulgar. null = hueco
  const blue = 'bg-blue-600/70 border-blue-300';
  const orange = 'bg-orange-600/70 border-orange-300';
  const gold = 'bg-amber-500/80 border-amber-200 text-slate-950';
  const buttons: ({ action: ControlAction | 'spin'; label: string; color: string } | null)[] =
    mode === 'versus'
      ? [
          { action: 'down', label: 'BLOQUEO', color: 'bg-slate-500/70 border-slate-200' },
          { action: 'special', label: 'SÚPER', color: gold },
          { action: 'heavy', label: 'FUERTE', color: orange },
          { action: 'light', label: 'GOLPE', color: blue }
        ]
      : [
          { action: 'special', label: 'MAGIA', color: gold },
          { action: 'heavy', label: 'SALTO', color: orange },
          { action: 'spin', label: 'GIRO', color: 'bg-slate-500/70 border-slate-200' },
          { action: 'light', label: 'ATAQUE', color: blue }
        ];
  const btn = 64 * scale;

  return (
    <div
      className={`${docked ? 'arcade-control-dock' : 'fixed inset-x-0 bottom-0 z-40 px-5 pb-5'} flex items-end justify-between pointer-events-none select-none ${touchSwap ? 'flex-row-reverse' : ''}`}
      style={{ touchAction: 'none' }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Joystick: arrastrar mueve; arriba salta (versus) y abajo bloquea */}
      <div
        className="pointer-events-auto relative rounded-full bg-white/10 border-2 border-white/25 backdrop-blur-sm"
        style={{ width: STICK * scale, height: STICK * scale, touchAction: 'none' }}
        onPointerDown={e => {
          sounds.init();
          capture(e);
          moveStick(e);
        }}
        onPointerMove={e => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) moveStick(e);
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
      >
        <div
          className="absolute rounded-full bg-amber-400/80 border-2 border-amber-200 shadow-lg"
          style={{
            width: radius,
            height: radius,
            left: radius / 2 + knob.x,
            top: radius / 2 + knob.y
          }}
        />
      </div>

      {/* Botones de ataque (y bloqueo en versus) */}
      <div className="pointer-events-auto flex flex-col items-end gap-2" style={{ touchAction: 'none' }}>
        {mode === 'arcade' && (
          <button
            className="mb-1 px-3 py-1 rounded-full bg-black/60 border border-white/30 text-xs font-bold text-slate-200"
            onPointerDown={() => {
              sendKey('keydown', { code: 'Escape', key: 'Escape' });
              sendKey('keyup', { code: 'Escape', key: 'Escape' });
            }}
          >
            PAUSA
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          {buttons.map((b, i) => !b ? <span key={i} /> : (
            <button
              key={b.action}
              className={`rounded-full border-2 font-black text-[11px] text-white shadow-lg active:scale-90 transition-transform ${b.color}`}
              style={{ width: btn, height: btn, touchAction: 'none' }}
              onPointerDown={e => {
                sounds.init();
                capture(e);
                buttonPress(b.action, true);
              }}
              onPointerUp={() => buttonPress(b.action, false)}
              onPointerCancel={() => buttonPress(b.action, false)}
              onContextMenu={e => e.preventDefault()}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
