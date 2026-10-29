// ==========================================================================
// PUENTE DE MANDOS (GAMEPAD API → TECLADO)
// Convierte botones y palancas en las mismas teclas que ya usa el juego, así que menús, selección,
// versus y arcade funcionan con mando sin cambios. El primer mando es el jugador 1 y el segundo el 2.
// Los botones de ataque se configuran en el menú de controles; cruceta, palanca y Start son fijos.
// ==========================================================================
import { CANONICAL, getControls, isCapturing, sendKey } from './controls';
import type { ButtonAction, ControlAction, VirtualKey } from './controls';

const DPAD: Record<'up' | 'down' | 'left' | 'right', number> = { up: 12, down: 13, left: 14, right: 15 };
const START_BUTTON = 9;
const ESCAPE: VirtualKey = { code: 'Escape', key: 'Escape' };
const STICK_DEADZONE = 0.5;
const POLL_MS = 16; // Temporizador propio: sigue sondeando aunque no se esté dibujando un cuadro

function readActions(pad: Gamepad, player: number): Set<ControlAction | 'start'> {
  const active = new Set<ControlAction | 'start'>();
  const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
  const [ax = 0, ay = 0] = pad.axes;
  if (pressed(DPAD.up) || ay < -STICK_DEADZONE) active.add('up');
  if (pressed(DPAD.down) || ay > STICK_DEADZONE) active.add('down');
  if (pressed(DPAD.left) || ax < -STICK_DEADZONE) active.add('left');
  if (pressed(DPAD.right) || ax > STICK_DEADZONE) active.add('right');
  const buttons = getControls().pad[player];
  for (const action of Object.keys(buttons) as ButtonAction[]) {
    if (pressed(buttons[action])) active.add(action);
  }
  if (pressed(START_BUTTON)) active.add('start');
  return active;
}

// Arranca el sondeo de mandos; devuelve la función para detenerlo
export function startGamepadBridge(): () => void {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return () => {};

  // Teclas virtuales que cada jugador tiene "pulsadas" ahora mismo
  const held: Map<string, VirtualKey>[] = CANONICAL.map(() => new Map());
  const poll = () => {
    const pads = navigator.getGamepads().filter((p): p is Gamepad => p !== null && p.connected);
    CANONICAL.forEach((map, player) => {
      const pad = pads[player];
      const wanted = new Map<string, VirtualKey>();
      // Mientras el menú de controles espera un botón, el mando no mueve el juego
      if (pad && !isCapturing()) {
        for (const action of readActions(pad, player)) {
          for (const vk of action === 'start' ? [ESCAPE] : map[action]) wanted.set(vk.code, vk);
        }
      }
      for (const [code, vk] of wanted) {
        if (!held[player].has(code)) {
          held[player].set(code, vk);
          sendKey('keydown', vk);
        }
      }
      for (const [code, vk] of [...held[player]]) {
        if (!wanted.has(code)) {
          held[player].delete(code);
          sendKey('keyup', vk);
        }
      }
    });
  };
  const timer = window.setInterval(poll, POLL_MS);

  return () => {
    window.clearInterval(timer);
    held.forEach(keys => keys.forEach(vk => sendKey('keyup', vk)));
  };
}
