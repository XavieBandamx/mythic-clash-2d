// ==========================================================================
// PUENTE DE MANDOS (GAMEPAD API → TECLADO)
// Convierte botones y palancas en las mismas teclas que ya usa el juego, así que menús, selección,
// versus y arcade funcionan con mando sin cambios. El primer mando es el jugador 1 y el segundo el 2.
// ==========================================================================

interface VirtualKey {
  code: string;
  key: string;
}

type PadAction = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'x' | 'y' | 'start';

const k = (code: string, key: string): VirtualKey => ({ code, key });

// A: golpe / confirmar · B: salto (arcade) o golpe fuerte (versus) · X e Y: magia / súper · Start: pausa / volver.
// El 2P manda a la vez sus teclas del versus (U/I/O) y las del arcade cooperativo (teclado numérico).
const PAD_KEYS: Record<PadAction, VirtualKey[]>[] = [
  {
    up: [k('KeyW', 'w')],
    down: [k('KeyS', 's')],
    left: [k('KeyA', 'a')],
    right: [k('KeyD', 'd')],
    a: [k('KeyJ', 'j')],
    b: [k('KeyK', 'k')],
    x: [k('KeyL', 'l')],
    y: [k('KeyL', 'l')],
    start: [k('Escape', 'Escape')]
  },
  {
    up: [k('ArrowUp', 'ArrowUp')],
    down: [k('ArrowDown', 'ArrowDown')],
    left: [k('ArrowLeft', 'ArrowLeft')],
    right: [k('ArrowRight', 'ArrowRight')],
    a: [k('KeyU', 'u'), k('Numpad1', '1')],
    b: [k('KeyI', 'i'), k('Numpad2', '2')],
    x: [k('KeyO', 'o'), k('Numpad3', '3')],
    y: [k('KeyO', 'o'), k('Numpad3', '3')],
    start: [k('Escape', 'Escape')]
  }
];

// Distribución estándar (Xbox / PlayStation en Chrome, Edge y Firefox)
const BUTTONS: Partial<Record<PadAction, number>> = { a: 0, b: 1, x: 2, y: 3, start: 9 };
const DPAD: Record<'up' | 'down' | 'left' | 'right', number> = { up: 12, down: 13, left: 14, right: 15 };
const STICK_DEADZONE = 0.5;
const POLL_MS = 16; // Temporizador propio: sigue sondeando aunque no se esté dibujando un cuadro

function readActions(pad: Gamepad): Set<PadAction> {
  const active = new Set<PadAction>();
  const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
  const [ax = 0, ay = 0] = pad.axes;
  if (pressed(DPAD.up) || ay < -STICK_DEADZONE) active.add('up');
  if (pressed(DPAD.down) || ay > STICK_DEADZONE) active.add('down');
  if (pressed(DPAD.left) || ax < -STICK_DEADZONE) active.add('left');
  if (pressed(DPAD.right) || ax > STICK_DEADZONE) active.add('right');
  for (const [action, index] of Object.entries(BUTTONS) as [PadAction, number][]) {
    if (pressed(index)) active.add(action);
  }
  return active;
}

function sendKey(type: 'keydown' | 'keyup', vk: VirtualKey) {
  window.dispatchEvent(new KeyboardEvent(type, { code: vk.code, key: vk.key, bubbles: true }));
}

// Arranca el sondeo de mandos; devuelve la función para detenerlo
export function startGamepadBridge(): () => void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return () => {};

  // Teclas virtuales que cada jugador tiene "pulsadas" ahora mismo
  const held: Set<string>[] = PAD_KEYS.map(() => new Set());
  const poll = () => {
    const pads = navigator.getGamepads().filter((p): p is Gamepad => p !== null && p.connected);
    PAD_KEYS.forEach((map, player) => {
      const pad = pads[player];
      const wanted = new Map<string, VirtualKey>();
      if (pad) {
        for (const action of readActions(pad)) {
          for (const vk of map[action]) wanted.set(vk.code, vk);
        }
      }
      for (const [code, vk] of wanted) {
        if (!held[player].has(code)) {
          held[player].add(code);
          sendKey('keydown', vk);
        }
      }
      for (const code of [...held[player]]) {
        if (!wanted.has(code)) {
          held[player].delete(code);
          const vk = Object.values(map).flat().find(v => v.code === code);
          if (vk) sendKey('keyup', vk);
        }
      }
    });
  };
  const timer = window.setInterval(poll, POLL_MS);

  return () => {
    window.clearInterval(timer);
    held.forEach((codes, player) => {
      for (const code of codes) {
        const vk = Object.values(PAD_KEYS[player]).flat().find(v => v.code === code);
        if (vk) sendKey('keyup', vk);
      }
    });
  };
}
