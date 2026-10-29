import type { Pantheon } from '../game/deities';
import { BOSS_CAM_X } from './levels';
import type { LevelTheme, MonsterKind, MonsterSkin } from './levels';

// ==========================================================================
// DIBUJO PROCEDURAL DEL MODO ARCADE: ESCENARIOS, MONSTRUOS, OBJETOS
// ==========================================================================

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const FLOOR_TOP = 455; // Línea del fondo del suelo (profundidad z = 0)
export const DEPTH = 200;     // Profundidad jugable: el frente está en y = FLOOR_TOP + DEPTH

// Posición en pantalla (sin cámara) de un punto del mundo 2.5D
export function screenY(z: number, height: number = 0): number {
  return FLOOR_TOP + z - height;
}

// --- ESCENARIOS CON PARALLAX ---

function drawFarLandmark(ctx: CanvasRenderingContext2D, pantheon: Pantheon, x: number, base: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (pantheon === 'Grecia') {
    // Templo en lo alto de una colina
    ctx.moveTo(x - 160, base);
    ctx.quadraticCurveTo(x, base - 140, x + 160, base);
    ctx.fill();
    ctx.fillRect(x - 60, base - 150, 120, 10);
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 54 + i * 26, base - 140, 8, 40);
    ctx.beginPath();
    ctx.moveTo(x - 66, base - 150);
    ctx.lineTo(x, base - 178);
    ctx.lineTo(x + 66, base - 150);
    ctx.fill();
  } else if (pantheon === 'Egipto') {
    // Pirámides
    ctx.moveTo(x - 150, base);
    ctx.lineTo(x - 20, base - 170);
    ctx.lineTo(x + 110, base);
    ctx.moveTo(x + 60, base);
    ctx.lineTo(x + 150, base - 100);
    ctx.lineTo(x + 240, base);
    ctx.fill();
  } else if (pantheon === 'México') {
    // Pirámide escalonada con templo
    for (let i = 0; i < 5; i++) {
      const w = 260 - i * 44;
      ctx.fillRect(x - w / 2, base - (i + 1) * 30, w, 30);
    }
    ctx.fillRect(x - 24, base - 185, 48, 35);
  } else {
    // Monte nevado y pagoda
    ctx.moveTo(x - 200, base);
    ctx.lineTo(x - 30, base - 190);
    ctx.lineTo(x + 140, base);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.moveTo(x - 66, base - 150);
    ctx.lineTo(x - 30, base - 190);
    ctx.lineTo(x + 6, base - 150);
    ctx.fill();
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      const w = 70 - i * 12;
      ctx.fillRect(x + 200 - w / 2, base - 30 - i * 32, w, 22);
      ctx.fillRect(x + 200 - w / 2 - 12, base - 34 - i * 32, w + 24, 6);
    }
  }
}

function drawMidProp(ctx: CanvasRenderingContext2D, pantheon: Pantheon, x: number, base: number, theme: LevelTheme, variant: number) {
  ctx.save();
  if (pantheon === 'Grecia') {
    // Columna de mármol (algunas rotas)
    const h = variant % 3 === 0 ? 110 : 190;
    ctx.fillStyle = theme.mid;
    ctx.fillRect(x - 16, base - h, 32, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 12 + i * 8, base - h, 3, h);
    ctx.fillStyle = theme.mid;
    ctx.fillRect(x - 24, base - 12, 48, 12);
    if (h > 150) ctx.fillRect(x - 24, base - h - 10, 48, 12);
  } else if (pantheon === 'Egipto') {
    // Obelisco
    ctx.fillStyle = theme.mid;
    ctx.beginPath();
    ctx.moveTo(x - 18, base);
    ctx.lineTo(x - 12, base - 190);
    ctx.lineTo(x, base - 210);
    ctx.lineTo(x + 12, base - 190);
    ctx.lineTo(x + 18, base);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 5, base - 170 + i * 30, 10, 12);
  } else if (pantheon === 'México') {
    // Estela de piedra tallada
    ctx.fillStyle = theme.mid;
    ctx.fillRect(x - 26, base - 150, 52, 150);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x - 16, base - 136, 32, 24);
    ctx.fillRect(x - 10, base - 100, 20, 40);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x - 10, base - 128, 6, 6);
    ctx.fillRect(x + 4, base - 128, 6, 6);
  } else {
    // Torii
    ctx.fillStyle = theme.mid;
    ctx.fillRect(x - 70, base - 170, 14, 170);
    ctx.fillRect(x + 56, base - 170, 14, 170);
    ctx.fillRect(x - 92, base - 182, 184, 14);
    ctx.fillRect(x - 76, base - 150, 152, 10);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(x - 96, base - 190, 192, 8);
  }
  ctx.restore();
}

// Imágenes pintadas de un nivel ya cargadas (null = se dibuja por código)
export interface PaintedArt {
  background: HTMLImageElement | null;
  horizonY: number;
  floor: HTMLImageElement | null;
  platform?: boolean;
}

// Panorama pintado: su horizonte coincide con el borde del suelo y se desplaza despacio a lo largo del nivel
function drawPaintedBackdrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, horizonY: number, camX: number) {
  const baseline = FLOOR_TOP - 22;
  const scale = Math.max((VIEW_W * 1.08) / img.width, baseline / horizonY);
  const w = img.width * scale;
  const parallax = (w - VIEW_W) / BOSS_CAM_X; // Recorre el ancho sobrante en todo el nivel, sin repetirse
  const x = -Math.min(w - VIEW_W, Math.max(0, camX) * parallax);
  ctx.drawImage(img, x, baseline - horizonY * scale, w, img.height * scale);
}

// El suelo pintado se aplasta hacia el fondo para simular perspectiva; se calcula una vez por imagen
const FLOOR_TILE_SCALE = 0.85; // Tamaño de la pieza en pantalla
const FLOOR_TILE_SPAN = 1.6;   // Cuántas alturas de la pieza caben del fondo al frente
const floorStrips = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

function getFloorStrip(img: HTMLImageElement): HTMLCanvasElement {
  const cached = floorStrips.get(img);
  if (cached) return cached;
  const rows = VIEW_H - FLOOR_TOP;
  const strip = document.createElement('canvas');
  strip.width = Math.round(img.width * FLOOR_TILE_SCALE);
  strip.height = rows;
  const sctx = strip.getContext('2d');
  if (sctx) {
    const a = 0.45; // Menor = perspectiva más marcada
    const fMax = 1 / a - 1 / (1 + a);
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1);
      const f = (1 / a - 1 / (t + a)) / fMax; // 0 en el fondo, 1 al frente (proyectivo)
      const srcY = Math.floor(f * FLOOR_TILE_SPAN * img.height) % img.height;
      sctx.drawImage(img, 0, srcY, img.width, 1, 0, r, strip.width, 1);
    }
    // Más oscuro al fondo y en general, para que los personajes resalten
    const tone = sctx.createLinearGradient(0, 0, 0, rows);
    tone.addColorStop(0, 'rgba(30, 15, 45, 0.55)');
    tone.addColorStop(1, 'rgba(30, 15, 45, 0.2)');
    sctx.fillStyle = tone;
    sctx.fillRect(0, 0, strip.width, rows);
  }
  floorStrips.set(img, strip);
  return strip;
}

function drawPaintedFloor(ctx: CanvasRenderingContext2D, img: HTMLImageElement, camX: number) {
  const strip = getFloorStrip(img);
  // Avanza al mismo ritmo que la cámara para que los pies de todos queden fijos sobre el suelo
  for (let x = -(((camX % strip.width) + strip.width) % strip.width); x < VIEW_W; x += strip.width) {
    ctx.drawImage(strip, Math.floor(x), FLOOR_TOP);
  }
}

// Arena de una pantalla: la imagen trae su suelo, cuyo borde (horizonY) se alinea con el fondo del suelo jugable
function drawPlatformBackdrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, horizonY: number) {
  const baseline = FLOOR_TOP - 22;
  const scale = Math.max(VIEW_W / img.width, (VIEW_H - baseline) / (img.height - horizonY));
  const w = img.width * scale;
  ctx.drawImage(img, (VIEW_W - w) / 2, baseline - horizonY * scale, w, img.height * scale);
}

export function drawBackground(ctx: CanvasRenderingContext2D, pantheon: Pantheon, theme: LevelTheme, camX: number, art?: PaintedArt) {
  if (art?.background && art.platform) {
    drawPlatformBackdrop(ctx, art.background, art.horizonY);
    return;
  }
  if (art?.background) {
    drawPaintedBackdrop(ctx, art.background, art.horizonY, camX);
  } else {
    drawProceduralBackdrop(ctx, pantheon, theme, camX);
  }

  // Franja trasera del suelo
  ctx.fillStyle = theme.wall;
  ctx.fillRect(0, FLOOR_TOP - 22, VIEW_W, 22);

  if (art?.floor) {
    drawPaintedFloor(ctx, art.floor, camX);
  } else {
    drawProceduralFloor(ctx, theme, camX);
  }

  // Oscurece el frente para dar profundidad
  const shade = ctx.createLinearGradient(0, FLOOR_TOP, 0, VIEW_H);
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
  shade.addColorStop(0.4, 'rgba(0, 0, 0, 0)');
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, FLOOR_TOP, VIEW_W, VIEW_H - FLOOR_TOP);
}

function drawProceduralBackdrop(ctx: CanvasRenderingContext2D, pantheon: Pantheon, theme: LevelTheme, camX: number) {
  // Cielo
  const sky = ctx.createLinearGradient(0, 0, 0, FLOOR_TOP);
  sky.addColorStop(0, theme.skyTop);
  sky.addColorStop(1, theme.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, FLOOR_TOP);

  // Sol / luna con halo
  const sunX = 980 - camX * 0.03;
  const halo = ctx.createRadialGradient(sunX, 140, 10, sunX, 140, 160);
  halo.addColorStop(0, theme.sun);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 160, -20, 320, 320);
  ctx.fillStyle = theme.sun;
  ctx.beginPath();
  ctx.arc(sunX, 140, 46, 0, Math.PI * 2);
  ctx.fill();

  // Plano lejano (parallax 0.15)
  const farOffset = camX * 0.15;
  const farBase = FLOOR_TOP - 28;
  ctx.globalAlpha = 0.85;
  for (let i = -1; i < 4; i++) {
    const tile = Math.floor(farOffset / 700) + i;
    drawFarLandmark(ctx, pantheon, tile * 700 - farOffset + 250, farBase, theme.far);
  }
  ctx.globalAlpha = 1;

  // Plano medio (parallax 0.45)
  const midOffset = camX * 0.45;
  const spacing = 420;
  for (let i = -1; i < 5; i++) {
    const tile = Math.floor(midOffset / spacing) + i;
    drawMidProp(ctx, pantheon, tile * spacing - midOffset + 120, FLOOR_TOP - 20, theme, Math.abs(tile));
  }
}

// Suelo con baldosas en perspectiva (se mueve a la velocidad de la cámara)
function drawProceduralFloor(ctx: CanvasRenderingContext2D, theme: LevelTheme, camX: number) {
  ctx.fillStyle = theme.floor;
  ctx.fillRect(0, FLOOR_TOP, VIEW_W, VIEW_H - FLOOR_TOP);
  ctx.strokeStyle = theme.floorLine;
  ctx.lineWidth = 2;
  for (let row = 0; row <= 5; row++) {
    const y = FLOOR_TOP + row * row * 9;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    ctx.stroke();
  }
  const tileW = 160;
  const start = -((camX % tileW) + tileW);
  for (let x = start; x < VIEW_W + tileW * 2; x += tileW) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR_TOP);
    ctx.lineTo(x - (x - VIEW_W / 2) * 0.35, VIEW_H);
    ctx.stroke();
  }
}

// --- MONSTRUOS PROCEDURALES ---

export type MonsterPose = 'idle' | 'walk' | 'windup' | 'strike' | 'hurt' | 'knockdown' | 'down' | 'flee';

export interface MonsterView {
  kind: MonsterKind;
  skin: MonsterSkin;
  height: number;
  x: number;        // Pies en pantalla
  y: number;
  facing: 1 | -1;
  pose: MonsterPose;
  t: number;        // Ticks de animación
  progress: number; // 0..1 dentro de la pose (aviso o golpe)
  flash: boolean;
  alpha: number;
}

function drawHead(ctx: CanvasRenderingContext2D, skin: MonsterSkin, H: number, paint: (c: string) => string) {
  const r = H * 0.1;
  const cy = -H * 0.86;
  const eye = (ex: number, ey: number, size: number) => {
    ctx.fillStyle = paint(skin.accent);
    ctx.shadowColor = skin.accent;
    ctx.shadowBlur = 8;
    ctx.fillRect(ex, ey, size, size * 0.7);
    ctx.shadowBlur = 0;
  };

  switch (skin.head) {
    case 'skull':
    case 'helmet': {
      ctx.fillStyle = paint('#e7e5e4');
      ctx.beginPath();
      ctx.arc(0, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-r * 0.55, cy + r * 0.6, r * 1.2, r * 0.6);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(r * 0.1, cy - r * 0.25, r * 0.45, r * 0.4);
      ctx.fillRect(-r * 0.55, cy - r * 0.25, r * 0.45, r * 0.4);
      eye(r * 0.2, cy - r * 0.15, r * 0.25);
      if (skin.head === 'helmet') {
        // Casco corintio de bronce con penacho
        ctx.fillStyle = paint(skin.detail);
        ctx.beginPath();
        ctx.arc(0, cy - r * 0.1, r * 1.12, Math.PI * 0.95, Math.PI * 2.05);
        ctx.fill();
        ctx.fillRect(-r * 1.1, cy - r * 0.1, r * 0.5, r * 1.1);
        ctx.fillStyle = paint('#dc2626');
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, cy - r * 1.25, r * 1.2, r * 0.35, -0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'mummy': {
      ctx.fillStyle = paint(skin.body);
      ctx.beginPath();
      ctx.arc(0, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = paint(skin.detail);
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r, cy + i * r * 0.35);
        ctx.lineTo(r, cy + i * r * 0.35 - r * 0.2);
        ctx.stroke();
      }
      eye(r * 0.25, cy - r * 0.2, r * 0.3);
      break;
    }
    case 'oni': {
      ctx.fillStyle = paint(skin.body);
      ctx.beginPath();
      ctx.arc(0, cy, r * 1.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = paint('#fef3c7');
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.5, cy - r * 0.8);
        ctx.lineTo(side * r * 0.9, cy - r * 1.9);
        ctx.lineTo(side * r * 0.1, cy - r * 0.9);
        ctx.fill();
      }
      ctx.fillRect(r * 0.1, cy + r * 0.45, r * 0.18, r * 0.35);
      ctx.fillRect(r * 0.55, cy + r * 0.45, r * 0.18, r * 0.35);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(-r * 0.2, cy - r * 0.5, r * 1.1, r * 0.15);
      eye(r * 0.25, cy - r * 0.3, r * 0.32);
      break;
    }
    case 'bull': {
      ctx.fillStyle = paint(skin.body);
      ctx.beginPath();
      ctx.ellipse(r * 0.2, cy, r * 1.2, r * 1.0, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = paint('#a16207');
      ctx.beginPath();
      ctx.ellipse(r * 1.05, cy + r * 0.35, r * 0.6, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = paint('#fef3c7');
      ctx.lineWidth = r * 0.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, cy - r * 0.7);
      ctx.quadraticCurveTo(-r * 1.6, cy - r * 1.4, -r * 0.8, cy - r * 2.2);
      ctx.moveTo(r * 0.6, cy - r * 0.8);
      ctx.quadraticCurveTo(r * 1.8, cy - r * 1.3, r * 1.2, cy - r * 2.2);
      ctx.stroke();
      eye(r * 0.45, cy - r * 0.3, r * 0.3);
      break;
    }
    case 'jackal': {
      ctx.fillStyle = paint(skin.body);
      ctx.beginPath();
      ctx.arc(0, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.3, cy - r * 0.2);
      ctx.lineTo(r * 2.0, cy + r * 0.25);
      ctx.lineTo(r * 0.3, cy + r * 0.6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, cy - r * 0.5);
      ctx.lineTo(-r * 0.4, cy - r * 2.0);
      ctx.lineTo(r * 0.1, cy - r * 0.7);
      ctx.moveTo(r * 0.0, cy - r * 0.6);
      ctx.lineTo(r * 0.3, cy - r * 2.0);
      ctx.lineTo(r * 0.6, cy - r * 0.5);
      ctx.fill();
      ctx.fillStyle = paint(skin.detail);
      ctx.fillRect(-r, cy + r * 0.5, r * 1.4, r * 0.35);
      eye(r * 0.35, cy - r * 0.2, r * 0.3);
      break;
    }
    case 'jaguar': {
      ctx.fillStyle = paint(skin.body);
      ctx.beginPath();
      ctx.arc(0, cy, r * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-r * 0.6, cy - r * 0.9, r * 0.35, 0, Math.PI * 2);
      ctx.arc(r * 0.6, cy - r * 0.9, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = paint(skin.detail);
      for (const [sx, sy] of [[-0.5, -0.3], [0.1, -0.6], [-0.2, 0.3], [0.6, 0.1]]) {
        ctx.beginPath();
        ctx.arc(sx * r, cy + sy * r, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = paint('#fef3c7');
      ctx.fillRect(r * 0.4, cy + r * 0.5, r * 0.15, r * 0.4);
      ctx.fillRect(r * 0.8, cy + r * 0.5, r * 0.15, r * 0.4);
      eye(r * 0.35, cy - r * 0.2, r * 0.32);
      break;
    }
    case 'hood': {
      ctx.fillStyle = paint(skin.body);
      ctx.beginPath();
      ctx.moveTo(-r * 1.1, cy + r * 0.9);
      ctx.lineTo(-r * 0.2, cy - r * 1.8);
      ctx.lineTo(r * 1.1, cy + r * 0.9);
      ctx.fill();
      ctx.fillStyle = paint('#fed7aa');
      ctx.beginPath();
      ctx.arc(r * 0.25, cy + r * 0.2, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      eye(r * 0.4, cy, r * 0.22);
      break;
    }
    default: {
      // imp: cabeza grande con orejas puntiagudas
      ctx.fillStyle = paint(skin.body);
      ctx.beginPath();
      ctx.arc(0, cy, r * 1.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, cy - r * 0.3);
      ctx.lineTo(-r * 1.9, cy - r * 1.1);
      ctx.lineTo(-r * 0.5, cy - r * 0.9);
      ctx.fill();
      if (skin.extra === 'shell') {
        // Plato de agua del kappa
        ctx.fillStyle = paint('#bae6fd');
        ctx.beginPath();
        ctx.ellipse(0, cy - r * 1.05, r * 0.7, r * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      eye(r * 0.3, cy - r * 0.3, r * 0.42);
      eye(-r * 0.25, cy - r * 0.3, r * 0.32);
    }
  }
}

function drawWeapon(ctx: CanvasRenderingContext2D, skin: MonsterSkin, H: number, hx: number, hy: number, ang: number, paint: (c: string) => string) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  ctx.lineCap = 'round';
  switch (skin.weapon) {
    case 'spear': {
      ctx.strokeStyle = paint('#78350f');
      ctx.lineWidth = H * 0.025;
      ctx.beginPath();
      ctx.moveTo(hx - dx * H * 0.25, hy - dy * H * 0.25);
      ctx.lineTo(hx + dx * H * 0.55, hy + dy * H * 0.55);
      ctx.stroke();
      ctx.fillStyle = paint('#d6d3d1');
      const tx = hx + dx * H * 0.55;
      const ty = hy + dy * H * 0.55;
      ctx.beginPath();
      ctx.moveTo(tx + dx * H * 0.12, ty + dy * H * 0.12);
      ctx.lineTo(tx - dy * H * 0.04, ty + dx * H * 0.04);
      ctx.lineTo(tx + dy * H * 0.04, ty - dx * H * 0.04);
      ctx.fill();
      break;
    }
    case 'club':
    case 'kanabo': {
      const len = H * (skin.weapon === 'kanabo' ? 0.5 : 0.42);
      ctx.strokeStyle = paint(skin.weapon === 'kanabo' ? '#27272a' : '#78350f');
      ctx.lineWidth = H * (skin.weapon === 'kanabo' ? 0.07 : 0.05);
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + dx * len, hy + dy * len);
      ctx.stroke();
      // Obsidiana del macuahuitl o púas del kanabo
      ctx.fillStyle = paint(skin.weapon === 'kanabo' ? '#a1a1aa' : '#18181b');
      for (let i = 1; i <= 4; i++) {
        const px = hx + dx * len * (0.35 + i * 0.15);
        const py = hy + dy * len * (0.35 + i * 0.15);
        ctx.fillRect(px - dy * H * 0.045 - 2, py + dx * H * 0.045 - 2, 4, 4);
        ctx.fillRect(px + dy * H * 0.045 - 2, py - dx * H * 0.045 - 2, 4, 4);
      }
      break;
    }
    case 'axe': {
      ctx.strokeStyle = paint('#78350f');
      ctx.lineWidth = H * 0.03;
      const ex = hx + dx * H * 0.45;
      const ey = hy + dy * H * 0.45;
      ctx.beginPath();
      ctx.moveTo(hx - dx * H * 0.1, hy - dy * H * 0.1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = paint('#d6d3d1');
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex - dy * side * H * 0.06, ey + dx * side * H * 0.06, H * 0.09, ang + (side === 1 ? 0 : Math.PI), ang + (side === 1 ? Math.PI : Math.PI * 2));
        ctx.fill();
      }
      break;
    }
    case 'khopesh': {
      ctx.strokeStyle = paint('#facc15');
      ctx.lineWidth = H * 0.03;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + dx * H * 0.15, hy + dy * H * 0.15);
      ctx.stroke();
      ctx.strokeStyle = paint('#e7e5e4');
      ctx.lineWidth = H * 0.035;
      ctx.beginPath();
      ctx.arc(hx + dx * H * 0.28, hy + dy * H * 0.28, H * 0.13, ang - Math.PI * 0.9, ang + Math.PI * 0.2);
      ctx.stroke();
      break;
    }
    case 'claws': {
      ctx.strokeStyle = paint('#fef3c7');
      ctx.lineWidth = 2.5;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + dx * H * 0.09 - dy * i * H * 0.03, hy + dy * H * 0.09 + dx * i * H * 0.03);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

export function drawMonster(ctx: CanvasRenderingContext2D, v: MonsterView) {
  const { skin, kind } = v;
  const H = v.height;
  const paint = (c: string) => (v.flash ? '#ffffff' : c);
  const bulk = kind === 'mini' ? 1.6 : kind === 'brute' ? 1.4 : kind === 'runner' || kind === 'thief' ? 0.9 : 1;

  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.scale(v.facing, 1);
  ctx.globalAlpha *= v.alpha;

  // Derribado: el cuerpo cae de espaldas
  if (v.pose === 'down') {
    ctx.translate(H * 0.45, -H * 0.06);
    ctx.rotate(-Math.PI / 2);
  } else if (v.pose === 'knockdown') {
    ctx.rotate(-0.7);
  } else if (kind === 'runner' || kind === 'thief') {
    ctx.rotate(0.12); // Postura encorvada
  }

  const moving = v.pose === 'walk' || v.pose === 'flee';
  const swing = moving ? Math.sin(v.t * (v.pose === 'flee' ? 0.45 : 0.25)) * H * 0.12 : 0;
  const bob = moving ? Math.abs(Math.sin(v.t * 0.25)) * H * 0.02 : Math.sin(v.t * 0.08) * H * 0.01;
  const hipY = -H * 0.45 - bob;
  const torsoTop = -H * 0.76 - bob;
  const torsoW = H * 0.28 * bulk;

  // Alas detrás del cuerpo
  if (skin.extra === 'wings') {
    const flap = Math.sin(v.t * 0.35) * H * 0.08;
    ctx.fillStyle = paint(skin.detail);
    ctx.beginPath();
    ctx.moveTo(-torsoW * 0.2, torsoTop + H * 0.05);
    ctx.lineTo(-H * 0.5, torsoTop - H * 0.15 - flap);
    ctx.lineTo(-H * 0.42, torsoTop + H * 0.18);
    ctx.lineTo(-H * 0.3, torsoTop + H * 0.1 + flap * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // Piernas con pies
  const limbColor = paint(skin.head === 'skull' || skin.head === 'helmet' ? '#e7e5e4' : skin.body);
  ctx.strokeStyle = limbColor;
  ctx.lineWidth = H * 0.06 * bulk;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-torsoW * 0.25, hipY);
  ctx.lineTo(-torsoW * 0.3 - swing, -H * 0.03);
  ctx.moveTo(torsoW * 0.25, hipY);
  ctx.lineTo(torsoW * 0.3 + swing, -H * 0.03);
  ctx.stroke();
  ctx.fillStyle = paint(skin.detail);
  for (const fx of [-torsoW * 0.3 - swing, torsoW * 0.3 + swing]) {
    ctx.beginPath();
    ctx.ellipse(fx + H * 0.025, -H * 0.02, H * 0.05 * bulk, H * 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Caparazón o saco a la espalda
  if (skin.extra === 'shell' || skin.extra === 'sack') {
    ctx.fillStyle = paint(skin.extra === 'shell' ? '#3f6212' : skin.detail);
    ctx.beginPath();
    ctx.ellipse(-torsoW * 0.65, torsoTop + H * 0.18, torsoW * 0.55, H * 0.17, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Torso
  ctx.fillStyle = paint(skin.head === 'skull' || skin.head === 'helmet' ? '#3f3f46' : skin.body);
  ctx.beginPath();
  ctx.roundRect(-torsoW / 2, torsoTop, torsoW, hipY - torsoTop + H * 0.02, H * 0.04);
  ctx.fill();
  if (!v.flash) {
    // Sombreado lateral para dar volumen
    const shade = ctx.createLinearGradient(-torsoW / 2, 0, torsoW / 2, 0);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
    shade.addColorStop(0.45, 'rgba(255, 255, 255, 0.08)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
    ctx.fillStyle = shade;
    ctx.fill();
  }
  if (skin.head === 'skull' || skin.head === 'helmet') {
    // Costillas visibles
    ctx.strokeStyle = paint('#e7e5e4');
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-torsoW * 0.35, torsoTop + H * 0.05 + i * H * 0.055);
      ctx.lineTo(torsoW * 0.35, torsoTop + H * 0.05 + i * H * 0.055);
      ctx.stroke();
    }
  }
  if (skin.extra === 'bandages') {
    ctx.strokeStyle = paint(skin.detail);
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(-torsoW / 2, torsoTop + i * H * 0.055);
      ctx.lineTo(torsoW / 2, torsoTop + i * H * 0.055 + H * 0.03);
      ctx.stroke();
    }
  }
  if (skin.extra === 'spots') {
    ctx.fillStyle = paint(skin.detail);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-torsoW * 0.3 + (i % 3) * torsoW * 0.3, torsoTop + H * 0.06 + Math.floor(i / 3) * H * 0.12, H * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cinturón / faldellín
  ctx.fillStyle = paint(skin.detail);
  ctx.fillRect(-torsoW / 2, hipY - H * 0.04, torsoW, H * 0.05);

  // Brazo trasero (con escudo si lo lleva)
  const shoulderY = torsoTop + H * 0.05;
  ctx.strokeStyle = paint(skin.head === 'skull' || skin.head === 'helmet' ? '#e7e5e4' : skin.body);
  ctx.lineWidth = H * 0.05 * bulk;
  ctx.beginPath();
  ctx.moveTo(-torsoW * 0.35, shoulderY);
  ctx.lineTo(-torsoW * 0.5 + swing * 0.5, shoulderY + H * 0.24);
  ctx.stroke();
  if (skin.extra === 'shield') {
    ctx.fillStyle = paint(skin.detail);
    ctx.beginPath();
    ctx.arc(torsoW * 0.15, shoulderY + H * 0.16, H * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = paint('#fde68a');
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Cabeza
  ctx.save();
  ctx.translate(0, -bob);
  drawHead(ctx, skin, H, paint);
  ctx.restore();

  // Brazo del arma: el ángulo marca el aviso (atrás) y el golpe (adelante)
  let ang = -0.5 + Math.sin(v.t * 0.08) * 0.08;
  if (v.pose === 'windup') ang = -0.5 - v.progress * 2.0;
  else if (v.pose === 'strike') ang = -2.5 + Math.min(1, v.progress * 2) * 3.1;
  else if (v.pose === 'hurt') ang = -1.3;
  else if (v.pose === 'flee') ang = 0.9;
  else if (moving) ang = -0.4 + swing / H;
  const armLen = H * 0.24;
  const sx = torsoW * 0.35;
  const hx = sx + Math.cos(ang) * armLen;
  const hy = shoulderY + Math.sin(ang) * armLen;
  ctx.strokeStyle = paint(skin.head === 'skull' || skin.head === 'helmet' ? '#e7e5e4' : skin.body);
  ctx.lineWidth = H * 0.05 * bulk;
  ctx.beginPath();
  ctx.moveTo(sx, shoulderY);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  drawWeapon(ctx, skin, H, hx, hy, ang, paint);
  ctx.fillStyle = limbColor;
  ctx.beginPath();
  ctx.arc(hx, hy, H * 0.035 * bulk, 0, Math.PI * 2);
  ctx.fill();

  // Destello de aviso antes del golpe
  if (v.pose === 'windup' && v.progress > 0.6) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(v.progress - 0.6) * 2})`;
    ctx.beginPath();
    ctx.arc(hx, hy, H * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// Lienzos auxiliares para el contorno oscuro de los monstruos (para que encajen con el pixel art de los dioses)
const FIG_W = 440;
const FIG_H = 380;
const FIG_FEET = 40; // Margen bajo los pies dentro del lienzo auxiliar
let figureCanvas: HTMLCanvasElement | null = null;
let silhouetteCanvas: HTMLCanvasElement | null = null;

export function drawMonsterOutlined(ctx: CanvasRenderingContext2D, v: MonsterView) {
  if (!figureCanvas || !silhouetteCanvas) {
    figureCanvas = document.createElement('canvas');
    silhouetteCanvas = document.createElement('canvas');
    figureCanvas.width = silhouetteCanvas.width = FIG_W;
    figureCanvas.height = silhouetteCanvas.height = FIG_H;
  }
  const fctx = figureCanvas.getContext('2d');
  const sctx = silhouetteCanvas.getContext('2d');
  if (!fctx || !sctx) {
    drawMonster(ctx, v);
    return;
  }

  fctx.clearRect(0, 0, FIG_W, FIG_H);
  drawMonster(fctx, { ...v, x: FIG_W / 2, y: FIG_H - FIG_FEET, alpha: 1 });

  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, FIG_W, FIG_H);
  sctx.drawImage(figureCanvas, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#0b0b12';
  sctx.fillRect(0, 0, FIG_W, FIG_H);

  const ox = Math.round(v.x - FIG_W / 2);
  const oy = Math.round(v.y - (FIG_H - FIG_FEET));
  ctx.save();
  ctx.globalAlpha *= v.alpha;
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) ctx.drawImage(silhouetteCanvas, ox + dx, oy + dy);
  ctx.drawImage(figureCanvas, ox, oy);
  ctx.restore();
}

// --- OBJETOS, PROYECTILES Y AVISOS ---

export function drawItem(ctx: CanvasRenderingContext2D, kind: 'pot' | 'food', x: number, y: number, t: number) {
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 0.1) * 2);
  if (kind === 'pot') {
    // Vasija de magia azul
    ctx.fillStyle = '#2563eb';
    ctx.beginPath();
    ctx.ellipse(0, -14, 12, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-6, -34, 12, 8);
    ctx.fillStyle = '#93c5fd';
    ctx.fillRect(-4, -20, 4, 8);
    ctx.shadowColor = '#60a5fa';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#bfdbfe';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    // Muslo de carne
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.ellipse(-4, -12, 16, 11, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(10, -22, 12, 6);
    ctx.beginPath();
    ctx.arc(22, -22, 4, 0, Math.PI * 2);
    ctx.arc(22, -16, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawOrb(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, t: number) {
  const r = 18 + Math.sin(t * 0.5) * 3;
  const glow = ctx.createRadialGradient(x, y, 2, x, y, r * 2.2);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.35, color);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
  ctx.fill();
}

// Círculo de aviso en el suelo antes de un rayo o impacto del jefe
export function drawTelegraph(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, progress: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25 + progress * 0.35;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.15 + progress * 0.25;
  ctx.beginPath();
  ctx.ellipse(x, y, radius * progress, radius * 0.35 * progress, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- AMBIENTE Y PRIMER PLANO ---

// Objetos por delante de los personajes (columnas, palmeras...) que pasan más rápido que la cámara: dan profundidad.
// Las posiciones son fijas por nivel para que siempre aparezcan en el mismo sitio.
const FOREGROUND_SPEED = 1.3;
const FOREGROUND_SCALE = 0.62;

// Versión oscurecida de cada objeto, calculada una sola vez (en celular, filtrar cada cuadro es caro)
const darkProps = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function darkened(img: HTMLImageElement): HTMLCanvasElement {
  const cached = darkProps.get(img);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const cctx = c.getContext('2d');
  if (cctx) {
    cctx.drawImage(img, 0, 0);
    cctx.globalCompositeOperation = 'source-atop';
    cctx.fillStyle = 'rgba(12, 8, 20, 0.58)';
    cctx.fillRect(0, 0, c.width, c.height);
  }
  darkProps.set(img, c);
  return c;
}

export function drawForeground(ctx: CanvasRenderingContext2D, props: HTMLImageElement[], camX: number, seed: number) {
  if (props.length === 0) return;
  ctx.save();
  for (let k = 0; k < 10; k++) {
    const img = darkened(props[(k * 5 + seed) % props.length]);
    const w = img.width * FOREGROUND_SCALE;
    const h = img.height * FOREGROUND_SCALE;
    const x = 220 + k * 480 + ((k * 137 + seed * 61) % 170) - camX * FOREGROUND_SPEED;
    if (x + w < 0 || x > VIEW_W) continue;
    ctx.drawImage(img, x, VIEW_H + 24 - h, w, h);
  }
  ctx.restore();
}

// Partículas de ambiente por reino, sin estado: la posición sale del reloj del juego
export function drawAmbient(ctx: CanvasRenderingContext2D, pantheon: Pantheon, tick: number, camX: number, cosmic: boolean) {
  const drift = camX * 0.35; // Se quedan atrás al caminar, como si estuvieran en el aire entre la cámara y el fondo
  const wrapX = (v: number) => ((v % (VIEW_W + 80)) + VIEW_W + 80) % (VIEW_W + 80) - 40;
  ctx.save();
  if (cosmic) {
    // Polvo de estrellas dorado que titila
    for (let i = 0; i < 40; i++) {
      const tw = (Math.sin(tick * 0.06 + i * 1.7) + 1) / 2;
      ctx.fillStyle = `rgba(253, 230, 138, ${0.15 + tw * 0.6})`;
      ctx.fillRect(wrapX(i * 173 - drift * 0.5), (i * 97) % (VIEW_H - 60), 2 + tw * 2, 2 + tw * 2);
    }
  } else if (pantheon === 'Grecia') {
    // Hojas de olivo que caen girando y motas de sol
    for (let i = 0; i < 16; i++) {
      const x = wrapX(VIEW_W - (tick * (0.9 + (i % 4) * 0.3) + i * 211) - drift);
      const y = (i * 131 + tick * (0.45 + (i % 3) * 0.2)) % VIEW_H;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(132, 204, 22, 0.75)' : 'rgba(77, 124, 15, 0.8)';
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(tick * 0.04 + i) * 14, y, 6, 2.6, tick * 0.05 + i, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const tw = (Math.sin(tick * 0.05 + i * 2.3) + 1) / 2;
      ctx.fillStyle = `rgba(254, 240, 138, ${tw * 0.5})`;
      ctx.beginPath();
      ctx.arc(wrapX(i * 97 - drift * 0.6 + tick * 0.2), 120 + ((i * 53) % 300), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pantheon === 'Egipto') {
    // Ráfagas de arena a ras del suelo y polvo dorado flotando
    ctx.strokeStyle = 'rgba(253, 224, 171, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 22; i++) {
      const x = wrapX(VIEW_W - (tick * (5 + (i % 5)) + i * 157) - drift);
      const y = 470 + ((i * 67) % 240);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 30 + (i % 4) * 14, y + Math.sin(tick * 0.1 + i) * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const tw = (Math.sin(tick * 0.04 + i) + 1) / 2;
      ctx.fillStyle = `rgba(251, 191, 36, ${0.2 + tw * 0.4})`;
      ctx.fillRect(wrapX(i * 131 - tick * 0.6 - drift), 150 + ((i * 89 + tick * 0.15) % 420), 2, 2);
    }
  } else if (pantheon === 'México') {
    // Brasas que suben y luciérnagas
    for (let i = 0; i < 20; i++) {
      const y = VIEW_H - ((tick * (1 + (i % 4) * 0.4) + i * 149) % (VIEW_H + 40));
      const x = wrapX(i * 113 + Math.sin(tick * 0.03 + i) * 22 - drift);
      ctx.fillStyle = `rgba(${i % 2 ? '251, 146, 60' : '239, 68, 68'}, ${0.4 + 0.5 * Math.abs(Math.sin(tick * 0.2 + i))})`;
      ctx.fillRect(x, y, 3, 3);
    }
    for (let i = 0; i < 10; i++) {
      const glow = (Math.sin(tick * 0.08 + i * 1.9) + 1) / 2;
      const x = wrapX(i * 181 + Math.sin(tick * 0.02 + i) * 60 - drift * 0.8);
      const y = 260 + ((i * 71) % 260) + Math.cos(tick * 0.03 + i) * 25;
      ctx.fillStyle = `rgba(190, 242, 100, ${glow * 0.8})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + glow * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pantheon === 'Japón') {
    // Pétalos de cerezo con el viento
    for (let i = 0; i < 24; i++) {
      const x = wrapX(VIEW_W - (tick * (1.3 + (i % 5) * 0.35) + i * 197) - drift);
      const y = (i * 137 + tick * (0.6 + (i % 3) * 0.25)) % VIEW_H;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(253, 242, 248, 0.85)' : 'rgba(249, 168, 212, 0.85)';
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(tick * 0.05 + i) * 12, y, 4.5, 2.4, tick * 0.04 + i, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
