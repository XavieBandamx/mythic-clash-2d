import { useEffect, useState } from 'react';
import { ArrowLeft, Gamepad2, Keyboard, Smartphone } from 'lucide-react';
import OptionsFrame from './OptionsFrame';
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
      className="control-key" data-listening={active}
      aria-label={label} aria-busy={active}
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
    <OptionsFrame kind="controls-screen" title="Encuentra tu estilo" subtitle={
        listening?.kind === 'key'
          ? 'Presiona la tecla nueva… (ESC para cancelar)'
          : listening?.kind === 'pad'
            ? padMissing
              ? `Conecta el control del ${PLAYERS[listening.player]} y presiona un botón… (ESC para cancelar)`
              : 'Presiona el botón nuevo en el control… (ESC para cancelar)'
            : 'Elige una casilla y presiona tu nueva tecla o botón. Los cambios se guardan solos.'
      } footer={<>
        <button className="options-back" onClick={() => { sounds.playNav(); onBack(); }}><ArrowLeft size={16} /> Volver <kbd>ESC</kbd></button>
        <button className="options-reset" onClick={() => { sounds.playNav(); setListening(null); setControls(structuredClone(DEFAULT_CONTROLS)); }}>Restaurar de fábrica</button>
      </>}>
      {listening && <div className="control-listening" role="status">
        <strong>{listening.kind === 'key' ? 'Presiona tu nueva tecla' : padMissing ? 'Conecta tu control y presiona un botón' : 'Presiona un botón del control'}</strong>
        <span>{PLAYERS[listening.player]} · {ACTIONS.find(action => action.id === listening.action)?.label}</span>
        <button onClick={() => setListening(null)}>Cancelar <kbd>ESC</kbd></button>
      </div>}
      <div className="control-tabs" role="tablist" aria-label="Tipo de controles">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => {
              sounds.playNav();
              setListening(null);
              setTab(id);
            }}
            className="control-tab" role="tab" aria-selected={tab === id}
            aria-controls="control-panel" id={`control-tab-${id}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="control-panel" id="control-panel" role="tabpanel" aria-labelledby={`control-tab-${tab}`}>
        {tab === 'teclado' && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-sky-200 text-xs uppercase tracking-wider">
                <th className="text-left pb-2">Acción</th>
                {PLAYERS.map(p => <th key={p} className="pb-2">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {ACTIONS.map(({ id, label }) => (
                <tr key={id} className="border-t border-white/5">
                  <td className="text-left text-slate-300 py-1.5">{label.replace('Botón 1 · ', '').replace('Botón 2 · ', '').replace('Botón 3 · ', '')}</td>
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
                <tr className="text-sky-200 text-xs uppercase tracking-wider">
                  <th className="text-left pb-2">Acción</th>
                  {PLAYERS.map((p, i) => <th key={p} className="pb-2">{p} · control {i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {ACTIONS.filter(a => a.id === 'light' || a.id === 'heavy' || a.id === 'special').map(({ id, label }) => (
                  <tr key={id} className="border-t border-white/5">
                    <td className="text-left text-slate-300 py-1.5">{label.replace('Botón 1 · ', '').replace('Botón 2 · ', '').replace('Botón 3 · ', '')}</td>
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
                    className="control-choice" aria-pressed={controls.touchSize === size}
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
                    className="control-choice" aria-pressed={controls.touchSwap === swap}
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

    </OptionsFrame>
  );
}
