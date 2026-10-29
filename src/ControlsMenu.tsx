import { useEffect, useState } from 'react';
import { Gamepad2, Keyboard, Smartphone } from 'lucide-react';
import { sounds } from './game/sound';
import {
  ACTIONS, DEFAULT_CONTROLS, assignButton, assignKey, buttonLabel, getControls, keyLabel, onControlsChange,
  setCapturing, setControls
} from './game/controls';
import type { ButtonAction, ControlAction } from './game/controls';

type Tab = 'teclado' | 'mando' | 'tactil';
type Listening = { kind: 'key'; player: number; action: ControlAction } | { kind: 'pad'; player: number; action: ButtonAction } | null;

const RESERVED_PAD = [9, 12, 13, 14, 15]; // Start y cruceta: fijos
const PLAYERS = ['Jugador 1', 'Jugador 2'];

// ==========================================================================
// PANTALLA DE CONFIGURACIÓN DE CONTROLES: teclado, mando y botones táctiles
// ==========================================================================
export default function ControlsMenu({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('teclado');
  const [controls, setLocal] = useState(getControls());
  const [listening, setListening] = useState<Listening>(null);
  const [padMissing, setPadMissing] = useState(false);

  useEffect(() => onControlsChange(() => setLocal(getControls())), []);

  // Esc vuelve al menú cuando no se está esperando una tecla
  useEffect(() => {
    if (listening) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sounds.playNav();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [listening, onBack]);

  // Espera la siguiente tecla
  useEffect(() => {
    if (listening?.kind !== 'key') return;
    setCapturing(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') {
        assignKey(listening.player, listening.action, e.code);
        sounds.playSelect();
      }
      setListening(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      setCapturing(false);
    };
  }, [listening]);

  // Espera el siguiente botón del mando de ese jugador
  useEffect(() => {
    if (listening?.kind !== 'pad') return;
    setCapturing(true);
    let before: boolean[] | null = null;
    const timer = window.setInterval(() => {
      const pad = navigator.getGamepads?.().filter((p): p is Gamepad => p !== null && p.connected)[listening.player];
      setPadMissing(!pad);
      if (!pad) return;
      const now = pad.buttons.map(b => b.pressed);
      if (before) {
        const index = now.findIndex((p, i) => p && !before![i] && !RESERVED_PAD.includes(i));
        if (index >= 0) {
          assignButton(listening.player, listening.action, index);
          sounds.playSelect();
          setListening(null);
        }
      }
      before = now;
    }, 16);
    const cancel = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setListening(null);
    };
    window.addEventListener('keydown', cancel, true);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', cancel, true);
      setCapturing(false);
      setPadMissing(false);
    };
  }, [listening]);

  const isListening = (kind: 'key' | 'pad', player: number, action: string) =>
    listening?.kind === kind && listening.player === player && listening.action === action;

  const cell = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={() => {
        sounds.playNav();
        onClick();
      }}
      className={`min-w-[96px] px-3 py-1.5 rounded-md border text-sm font-bold transition-colors ${
        active ? 'bg-amber-500 text-slate-950 border-amber-300 animate-pulse' : 'bg-slate-800 border-slate-600 text-slate-100 hover:border-amber-400'
      }`}
    >
      {active ? '...' : label}
    </button>
  );

  const tabs: { id: Tab; label: string; Icon: typeof Keyboard }[] = [
    { id: 'teclado', label: 'Teclado', Icon: Keyboard },
    { id: 'mando', label: 'Control', Icon: Gamepad2 },
    { id: 'tactil', label: 'Táctil', Icon: Smartphone }
  ];

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm p-6 text-center">
      <h2 className="font-cinzel text-3xl md:text-4xl font-bold text-amber-400 mb-1">Configurar Controles</h2>
      <p className="text-slate-400 text-sm mb-5">
        {listening?.kind === 'key'
          ? 'Presiona la tecla nueva… (ESC para cancelar)'
          : listening?.kind === 'pad'
            ? padMissing
              ? `Conecta el control del ${PLAYERS[listening.player]} y presiona un botón… (ESC para cancelar)`
              : 'Presiona el botón nuevo en el control… (ESC para cancelar)'
            : 'Haz clic en una casilla y presiona la tecla o el botón que quieras. Se guarda solo.'}
      </p>

      <div className="flex gap-2 mb-5">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => {
              sounds.playNav();
              setListening(null);
              setTab(id);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold ${
              tab === id ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-900/60 border-slate-700 text-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="w-full max-w-2xl bg-slate-900/70 border border-slate-700 rounded-xl p-4">
        {tab === 'teclado' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-amber-300 text-xs uppercase tracking-wider">
                <th className="text-left pb-2">Acción</th>
                {PLAYERS.map(p => <th key={p} className="pb-2">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map(({ id, label }) => (
                <tr key={id} className="border-t border-white/5">
                  <td className="text-left text-slate-300 py-1.5">{label}</td>
                  {PLAYERS.map((_, player) => (
                    <td key={player} className="py-1.5">
                      {cell(isListening('key', player, id), keyLabel(controls.keyboard[player][id]), () =>
                        setListening({ kind: 'key', player, action: id })
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'mando' && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-amber-300 text-xs uppercase tracking-wider">
                  <th className="text-left pb-2">Acción</th>
                  {PLAYERS.map((p, i) => <th key={p} className="pb-2">{p} · control {i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {ACTIONS.filter(a => a.id === 'light' || a.id === 'heavy' || a.id === 'special').map(({ id, label }) => (
                  <tr key={id} className="border-t border-white/5">
                    <td className="text-left text-slate-300 py-1.5">{label}</td>
                    {PLAYERS.map((_, player) => (
                      <td key={player} className="py-1.5">
                        {cell(isListening('pad', player, id), buttonLabel(controls.pad[player][id as ButtonAction]), () =>
                          setListening({ kind: 'pad', player, action: id as ButtonAction })
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-500 mt-3 text-left">
              Moverse: cruceta o palanca izquierda · Start: pausa / volver. El primer control conectado es el jugador 1.
            </p>
          </>
        )}

        {tab === 'tactil' && (
          <div className="space-y-4 text-left text-sm">
            <div>
              <span className="text-slate-300 block mb-2">Tamaño de los botones en pantalla</span>
              <div className="flex gap-2">
                {(['chico', 'normal', 'grande'] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => {
                      sounds.playNav();
                      setControls({ ...controls, touchSize: size });
                    }}
                    className={`px-4 py-2 rounded-lg border capitalize ${
                      controls.touchSize === size ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-800 border-slate-600 text-slate-300'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-slate-300 block mb-2">Lado de los botones</span>
              <div className="flex gap-2">
                {[false, true].map(swap => (
                  <button
                    key={String(swap)}
                    onClick={() => {
                      sounds.playNav();
                      setControls({ ...controls, touchSwap: swap });
                    }}
                    className={`px-4 py-2 rounded-lg border ${
                      controls.touchSwap === swap ? 'bg-amber-500/20 border-amber-400 text-amber-200' : 'bg-slate-800 border-slate-600 text-slate-300'
                    }`}
                  >
                    {swap ? 'Ataques a la izquierda' : 'Ataques a la derecha'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500">Los botones táctiles se activan con "Controles Touch" en la barra de arriba y aparecen en el versus.</p>
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => {
            sounds.playNav();
            setListening(null);
            setControls(structuredClone(DEFAULT_CONTROLS));
          }}
          className="px-5 py-2 rounded border border-slate-600 text-xs text-slate-300 hover:bg-slate-800"
        >
          Restaurar de fábrica
        </button>
        <button
          onClick={() => {
            sounds.playNav();
            onBack();
          }}
          className="px-5 py-2 rounded border border-amber-500/60 text-xs text-amber-200 hover:bg-amber-500/10"
        >
          Volver al Menú Principal (ESC)
        </button>
      </div>
    </div>
  );
}
