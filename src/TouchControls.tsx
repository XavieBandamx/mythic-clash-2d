import { useRef, useState } from 'react';
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
export default function TouchControls({ mode }: { mode: 'versus' | 'arcade' }) {
  const { touchSize, touchSwap } = getControls();
  const scale = SIZES[touchSize];
  const radius = (STICK * scale) / 2;
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const held = useRef(new Set<Dir>());

  const setDirs = (next: Set<Dir>) => {
    for (const d of held.current) if (!next.has(d)) press(d, false);
    for (const d of next) if (!held.current.has(d)) press(d, true);
    held.current = next;
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

  const labels = mode === 'versus' ? ['GOLPE', 'FUERTE', 'SÚPER'] : ['ATAQUE', 'SALTO', 'MAGIA'];
  const buttons: { action: ControlAction; label: string; color: string }[] = [
    { action: 'light', label: labels[0], color: 'bg-blue-600/70 border-blue-300' },
    { action: 'heavy', label: labels[1], color: 'bg-orange-600/70 border-orange-300' },
    { action: 'special', label: labels[2], color: 'bg-amber-500/80 border-amber-200 text-slate-950' }
  ];
  const btn = 64 * scale;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex items-end justify-between px-5 pb-5 pointer-events-none select-none ${touchSwap ? 'flex-row-reverse' : ''}`}
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

      {/* Botones en arco, como en los juegos de pelea para celular */}
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
        <div className="flex items-end gap-3">
          {buttons.map(({ action, label, color }, i) => (
            <button
              key={action}
              className={`rounded-full border-2 font-black text-[11px] text-white shadow-lg active:scale-90 transition-transform ${color}`}
              style={{ width: btn, height: btn, marginBottom: i === 1 ? btn * 0.5 : 0, touchAction: 'none' }}
              onPointerDown={e => {
                sounds.init();
                capture(e);
                press(action, true);
              }}
              onPointerUp={() => press(action, false)}
              onPointerCancel={() => press(action, false)}
              onContextMenu={e => e.preventDefault()}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
