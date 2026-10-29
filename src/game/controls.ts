// ==========================================================================
// CONTROLES CONFIGURABLES
// Cada tecla o botón que el jugador elige se traduce a la tecla "canónica" que el juego ya entiende,
// así versus, arcade, torre y menús funcionan con cualquier asignación sin cambios.
// ==========================================================================

export type ControlAction = 'up' | 'down' | 'left' | 'right' | 'light' | 'heavy' | 'special';
export type ButtonAction = 'light' | 'heavy' | 'special';

export const ACTIONS: { id: ControlAction; label: string }[] = [
  { id: 'up', label: 'Arriba / Saltar (versus)' },
  { id: 'down', label: 'Abajo / Bloquear' },
  { id: 'left', label: 'Izquierda' },
  { id: 'right', label: 'Derecha' },
  { id: 'light', label: 'Botón 1 · Golpe / Ataque' },
  { id: 'heavy', label: 'Botón 2 · Fuerte / Salto (arcade)' },
  { id: 'special', label: 'Botón 3 · Súper / Magia' }
];

export interface VirtualKey {
  code: string;
  key: string;
}

const k = (code: string, key: string): VirtualKey => ({ code, key });

// Teclas que el juego lee para cada jugador. El 2P manda las del versus (U/I/O) y las del arcade cooperativo (numérico).
export const CANONICAL: Record<ControlAction, VirtualKey[]>[] = [
  {
    up: [k('KeyW', 'w')],
    down: [k('KeyS', 's')],
    left: [k('KeyA', 'a')],
    right: [k('KeyD', 'd')],
    light: [k('KeyJ', 'j')],
    heavy: [k('KeyK', 'k')],
    special: [k('KeyL', 'l')]
  },
  {
    up: [k('ArrowUp', 'ArrowUp')],
    down: [k('ArrowDown', 'ArrowDown')],
    left: [k('ArrowLeft', 'ArrowLeft')],
    right: [k('ArrowRight', 'ArrowRight')],
    light: [k('KeyU', 'u'), k('Numpad1', '1')],
    heavy: [k('KeyI', 'i'), k('Numpad2', '2')],
    special: [k('KeyO', 'o'), k('Numpad3', '3')]
  }
];

export interface ControlSettings {
  keyboard: Record<ControlAction, string>[]; // Tecla física (e.code) por acción y jugador
  pad: Record<ButtonAction, number>[];       // Botón del mando por acción y jugador
  touchSize: 'chico' | 'normal' | 'grande';
  touchSwap: boolean;                        // Botones de ataque a la izquierda y cruceta a la derecha
}

export const DEFAULT_CONTROLS: ControlSettings = {
  keyboard: [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', light: 'KeyJ', heavy: 'KeyK', special: 'KeyL' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', light: 'KeyU', heavy: 'KeyI', special: 'KeyO' }
  ],
  pad: [
    { light: 0, heavy: 1, special: 2 },
    { light: 0, heavy: 1, special: 2 }
  ],
  touchSize: 'normal',
  touchSwap: false
};

const STORAGE_KEY = 'mythic-clash-controles';

function load(): ControlSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && Array.isArray(saved.keyboard) && Array.isArray(saved.pad)) return { ...DEFAULT_CONTROLS, ...saved };
  } catch {
    // Sin acceso al almacenamiento: se usan los controles de fábrica
  }
  return structuredClone(DEFAULT_CONTROLS);
}

let settings: ControlSettings = load();
const listeners = new Set<() => void>();

export function getControls(): ControlSettings {
  return settings;
}

export function setControls(next: ControlSettings) {
  settings = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Se queda solo en memoria
  }
  listeners.forEach(fn => fn());
}

export function onControlsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Asigna una tecla; si otra acción ya la usaba, intercambian teclas para que nunca haya dos acciones en la misma
export function assignKey(player: number, action: ControlAction, code: string) {
  const keyboard = settings.keyboard.map(m => ({ ...m }));
  const old = keyboard[player][action];
  keyboard.forEach(map => {
    for (const a of Object.keys(map) as ControlAction[]) if (map[a] === code) map[a] = old;
  });
  keyboard[player][action] = code;
  setControls({ ...settings, keyboard });
}

export function assignButton(player: number, action: ButtonAction, button: number) {
  const pad = settings.pad.map(m => ({ ...m }));
  const old = pad[player][action];
  for (const a of Object.keys(pad[player]) as ButtonAction[]) if (pad[player][a] === button) pad[player][a] = old;
  pad[player][action] = button;
  setControls({ ...settings, pad });
}

// Mientras el menú espera una tecla o botón nuevo, la traducción y el mando se apagan
let capturing = false;
export function setCapturing(on: boolean) {
  capturing = on;
}
export function isCapturing(): boolean {
  return capturing;
}

let synthetic = false;
export function sendKey(type: 'keydown' | 'keyup', vk: VirtualKey) {
  synthetic = true;
  window.dispatchEvent(new KeyboardEvent(type, { code: vk.code, key: vk.key, bubbles: true }));
  synthetic = false;
}

const ALL_CANONICAL = new Set(CANONICAL.flatMap(m => Object.values(m).flat().map(vk => vk.code)));

// Traduce las teclas físicas a las canónicas antes de que el juego las vea
export function startKeyRemapper(): () => void {
  const translate = (e: KeyboardEvent) => {
    if (synthetic || capturing || e.code === 'Escape') return;
    const targets: VirtualKey[] = [];
    settings.keyboard.forEach((map, player) => {
      for (const action of Object.keys(map) as ControlAction[]) {
        if (map[action] === e.code) targets.push(...CANONICAL[player][action]);
      }
    });
    // Tecla normal (Enter, B, Q, Espacio libre...): pasa sin cambios
    if (targets.length === 0 && !ALL_CANONICAL.has(e.code)) return;
    // Si ya es justo su tecla canónica, no hace falta reenviarla
    if (targets.length === 1 && targets[0].code === e.code) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.type === 'keydown' && e.repeat) return;
    for (const vk of targets) sendKey(e.type as 'keydown' | 'keyup', vk);
  };
  window.addEventListener('keydown', translate, true);
  window.addEventListener('keyup', translate, true);
  return () => {
    window.removeEventListener('keydown', translate, true);
    window.removeEventListener('keyup', translate, true);
  };
}

// Nombre legible de una tecla para la pantalla de configuración
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const names: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Espacio', Enter: 'Enter',
    ShiftLeft: 'Shift izq', ShiftRight: 'Shift der', ControlLeft: 'Ctrl izq', ControlRight: 'Ctrl der',
    AltLeft: 'Alt', AltRight: 'Alt der', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'",
    BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`', Tab: 'Tab', Backspace: 'Borrar'
  };
  return names[code] ?? code;
}

// Botones en el orden estándar de Xbox / PlayStation
const PAD_NAMES = ['A / ✕', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'Back / Share', 'Start', 'L3', 'R3'];
export function buttonLabel(index: number): string {
  return PAD_NAMES[index] ?? `Botón ${index}`;
}
