// ==========================================================================
// ARENAS DEL VERSUS: una pantalla fija pintada por reino (en public/arenas)
// ==========================================================================
import type { Pantheon } from './deities';

export interface ArenaDef {
  pantheon?: Pantheon; // Sin reino: arenas neutrales como Babel
  name: string;
  src: string;
  floorY: number;  // Fila de la imagen donde empieza el piso
  storm?: string;  // Color del destello de relámpago, si la arena tiene tormenta
  petals?: boolean;
}

const url = (file: string) => `${import.meta.env.BASE_URL}arenas/${file}`;

export const ARENAS: ArenaDef[] = [
  { pantheon: 'Grecia', name: 'El Coliseo del Olimpo', src: url('grecia.webp'), floorY: 556, storm: '255, 236, 170' },
  { pantheon: 'Egipto', name: 'El Tribunal de Osiris', src: url('egipto.webp'), floorY: 560 },
  { pantheon: 'México', name: 'La Cancha de Tenochtitlan', src: url('mexico.webp'), floorY: 545 },
  { pantheon: 'Japón', name: 'El Dojo de la Tormenta', src: url('japon.webp'), floorY: 612, storm: '200, 170, 255', petals: true },
  { name: 'La Torre de Babel', src: url('babel.webp'), floorY: 610, storm: '230, 230, 255' }
];

// Arena de Origen en la cima de la torre (no se elige en el menú)
export const ORIGEN_ARENA: ArenaDef = {
  name: 'El Telar del Cosmos',
  src: `${import.meta.env.BASE_URL}backgrounds/telar-fondo.webp`,
  floorY: 548
};

// Fila de pantalla donde se ve el borde del piso: un poco arriba de los pies (y=540) para que pisen dentro
const FLOOR_SCREEN_Y = 480;

export function drawArena(ctx: CanvasRenderingContext2D, img: HTMLImageElement, arena: ArenaDef, w: number, h: number, frame: number) {
  // Cubre todo el ancho y deja suficiente piso bajo la línea; recorta a los lados si hace falta
  const scale = Math.max(w / img.width, (h - FLOOR_SCREEN_Y) / (img.height - arena.floorY));
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dy = Math.min(0, Math.max(h - dh, FLOOR_SCREEN_Y - arena.floorY * scale));
  ctx.drawImage(img, (w - dw) / 2, dy, dw, dh);

  // Relámpago doble cada ~5 s
  if (arena.storm) {
    const t = frame % 300;
    const alpha = t < 4 ? 0.28 : t >= 8 && t < 12 ? 0.18 : 0;
    if (alpha > 0) {
      ctx.fillStyle = `rgba(${arena.storm}, ${alpha})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Pétalos de cerezo arrastrados por el viento (posiciones deterministas, sin estado)
  if (arena.petals) {
    ctx.fillStyle = 'rgba(249, 168, 212, 0.85)';
    for (let i = 0; i < 18; i++) {
      const speed = 1.2 + (i % 5) * 0.35;
      const x = w - ((frame * speed + i * 211) % (w + 40));
      const y = (i * 137 + frame * (0.6 + (i % 3) * 0.25)) % h;
      const sway = Math.sin(frame * 0.05 + i) * 12;
      ctx.beginPath();
      ctx.ellipse(x + sway, y, 4, 2.2, frame * 0.04 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
