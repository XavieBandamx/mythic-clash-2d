import type { DeityData } from './deities';
import { SPRITE_ASSETS } from './spriteAssets';

// ==========================================================================
// MOTOR DE SPRITE SHEETS: LUCHADOR DIBUJADO CON ctx.drawImage()
// ==========================================================================
export type SpriteAnimationName = 'idle' | 'run' | 'attack' | 'hit';

export interface SpriteAnimation {
  row: number;           // Fila de la hoja donde vive la animación
  frames: number;        // Cuadros en esa fila (de izquierda a derecha)
  frameDuration: number; // Ticks (60 FPS) por cuadro; en 'attack' se ignora y se sincroniza con el golpe
  loop: boolean;
}

export interface SpriteSheetConfig {
  src: string;
  frameWidth: number;
  frameHeight: number;
  scale: number;      // Escala de dibujo sobre el canvas de 1280x720
  footOffset: number; // Píxeles transparentes bajo los pies dentro del cuadro
  pixelArt: boolean;  // Desactiva el suavizado para sprites pixel art
  animations: Record<SpriteAnimationName, SpriteAnimation>;
  // Fila de golpe: cuadro tendido en el suelo y, si la hoja lo trae, cuadro levantándose
  lyingFrame?: number;
  getupFrame?: number;
}

// Plantilla común: una hoja por deidad en assets/sprites/<id>.webp, una fila por animación
const DEFAULT_SPRITE_LAYOUT: Omit<SpriteSheetConfig, 'src'> = {
  frameWidth: 128,
  frameHeight: 128,
  scale: 1.25,
  footOffset: 0,
  pixelArt: true,
  animations: {
    idle: { row: 0, frames: 6, frameDuration: 8, loop: true },
    run: { row: 1, frames: 8, frameDuration: 5, loop: true },
    attack: { row: 2, frames: 6, frameDuration: 4, loop: false },
    hit: { row: 3, frames: 3, frameDuration: 6, loop: false }
  }
};

// Hojas finales 4x4: filas idle / run / attack / hit, 4 cuadros cada una
export const GRID_4X4_ANIMATIONS: SpriteSheetConfig['animations'] = {
  idle: { row: 0, frames: 4, frameDuration: 10, loop: true },
  run: { row: 1, frames: 4, frameDuration: 7, loop: true },
  attack: { row: 2, frames: 4, frameDuration: 5, loop: false },
  // Ocho ticks por cuadro para caídas; el motor mantiene el retroceso en golpes leves.
  hit: { row: 3, frames: 4, frameDuration: 8, loop: false }
};

// Ajustes por deidad. Las hojas de assets/sprites se generan con tools/process_sprites.py, que deja los pies
// pegados al borde inferior de cada celda (footOffset 0) y el cuerpo centrado en horizontal.
// La fila de golpe de las hojas rediseñadas trae golpe, caída, tendido (2) y levantándose (3).
// Las hojas rediseñadas (assets/sprites/<id>-original.webp) ya traen a todos con el mismo cuerpo que Susanoo, así que
// comparten una sola escala: medir por la altura en idle encogería a los de corona o penacho alto (Osiris, Ra…).
// 0.73 ≈ 175 px / 240 px de altura típica en idle.
const REDESIGN_SCALE = 0.73;
const redesigned = (frameWidth: number, frameHeight: number): Partial<SpriteSheetConfig> => ({
  frameWidth, frameHeight, scale: REDESIGN_SCALE, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS, lyingFrame: 2, getupFrame: 3
});
export const SPRITE_SHEET_OVERRIDES: Record<string, Partial<SpriteSheetConfig>> = {
  odin: redesigned(526, 238),
  thor: redesigned(368, 255),
  kali: redesigned(504, 249),
  loki: redesigned(386, 241),
  sunwukong: redesigned(386, 244),
  amaterasu: redesigned(444, 254),
  anubis: redesigned(594, 245),
  hades: redesigned(476, 255),
  huitzilopochtli: redesigned(398, 266),
  mictlantecuhtli: redesigned(436, 248),
  osiris: redesigned(426, 256),
  poseidon: redesigned(558, 255),
  quetzalcoatl: redesigned(498, 253),
  ra: redesigned(606, 264),
  raijin: redesigned(478, 260),
  susanoo: redesigned(418, 245),
  // Jefe final: mide el doble que un dios (≈350 px en idle con la escala ×1.2 de los jefes)
  origen: { frameWidth: 442, frameHeight: 252, scale: 1.188, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS, lyingFrame: 2, getupFrame: 3 },
  zeus: redesigned(672, 246)
};

// Una ubicación compartida por versus, torre, arcade, monturas y selección.
export function spriteAssetSrc(id: string, extra = false) {
  const file = `${id}${extra ? '-extra' : ''}.webp`;
  return SPRITE_ASSETS[`../../assets/sprites/${file}`] ?? `${import.meta.env.BASE_URL}assets/sprites/${file}`;
}

export function getSpriteSheetConfig(deity: DeityData): SpriteSheetConfig {
  return {
    ...DEFAULT_SPRITE_LAYOUT,
    src: spriteAssetSrc(deity.id),
    ...SPRITE_SHEET_OVERRIDES[deity.id]
  };
}

// Segunda hoja de cada dios (assets/sprites/<id>-extra.webp), con los movimientos que la primera no trae:
// fila 0 salto (despegue, sube, punto alto, aterriza) · fila 1 defensa (guardia, bloqueo empujado, agachado, agachado en guardia)
// fila 2 súper (carga → suelta) · fila 3 golpe fuerte (preparación, impacto) y pose de victoria (2 cuadros).
// scale = la del dios × alto de pie en la primera hoja / promedio de la guardia (fila 2, cuadro 1) y la victoria
// (fila 4, cuadro 3) en la segunda: la guardia sale más agachada y la victoria más erguida que la pose de pie.
// Originales en assets/sprites/<id>-extra-original.webp.
export const EXTRA_ROWS = { jump: 0, defense: 1, super: 2, finish: 3 } as const;
const EXTRA_SHEET_OVERRIDES: Record<string, Pick<SpriteSheetConfig, 'frameWidth' | 'frameHeight' | 'scale'>> = {
  odin: { frameWidth: 532, frameHeight: 254, scale: 0.766 },
  thor: { frameWidth: 502, frameHeight: 266, scale: 0.702 },
  kali: { frameWidth: 494, frameHeight: 250, scale: 0.73 },
  loki: { frameWidth: 408, frameHeight: 252, scale: 0.71 },
  sunwukong: { frameWidth: 446, frameHeight: 273, scale: 0.676 },
  zeus: { frameWidth: 346, frameHeight: 258, scale: 0.754 },
  poseidon: { frameWidth: 426, frameHeight: 265, scale: 0.809 },
  hades: { frameWidth: 488, frameHeight: 247, scale: 0.741 },
  ra: { frameWidth: 470, frameHeight: 259, scale: 0.754 },
  anubis: { frameWidth: 568, frameHeight: 264, scale: 0.739 },
  osiris: { frameWidth: 376, frameHeight: 256, scale: 0.722 },
  quetzalcoatl: { frameWidth: 410, frameHeight: 244, scale: 0.754 },
  huitzilopochtli: { frameWidth: 486, frameHeight: 252, scale: 0.779 },
  mictlantecuhtli: { frameWidth: 394, frameHeight: 251, scale: 0.721 },
  amaterasu: { frameWidth: 446, frameHeight: 246, scale: 0.719 },
  susanoo: { frameWidth: 424, frameHeight: 246, scale: 0.741 },
  raijin: { frameWidth: 414, frameHeight: 246, scale: 0.754 },
  origen: { frameWidth: 384, frameHeight: 254, scale: 1.202 }
};

export function getExtraSheetConfig(deity: DeityData): SpriteSheetConfig | null {
  const extra = EXTRA_SHEET_OVERRIDES[deity.id];
  if (!extra) return null;
  return {
    ...DEFAULT_SPRITE_LAYOUT,
    pixelArt: false,
    animations: GRID_4X4_ANIMATIONS,
    src: spriteAssetSrc(deity.id, true),
    ...extra
  };
}

// Pantalla negra de carga: mejor que enseñar los dibujos por código mientras bajan las imágenes (en celular tardan)
export function isLoading(entries: (SpriteSheetEntry | null | undefined)[]): boolean {
  return entries.some(e => e?.status === 'loading');
}

export function drawLoading(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = '#04060a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 34px "Cinzel", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CARGANDO' + '.'.repeat(1 + (Math.floor(performance.now() / 400) % 3)), w / 2, h / 2);
}

export interface SpriteSheetEntry {
  image: HTMLImageElement;
  status: 'loading' | 'ready' | 'error';
}

// Caché global: cada hoja se descarga una sola vez aunque se repitan combates
const spriteSheetCache = new Map<string, SpriteSheetEntry>();

export function loadSpriteSheet(src: string): SpriteSheetEntry {
  const cached = spriteSheetCache.get(src);
  if (cached) return cached;

  const entry: SpriteSheetEntry = { image: new Image(), status: 'loading' };
  entry.image.onload = () => {
    entry.status = 'ready';
  };
  entry.image.onerror = () => {
    entry.status = 'error';
    console.warn(`[Sprites] No se pudo cargar ${src}; se usa el render procedural.`);
  };
  entry.image.src = src;
  spriteSheetCache.set(src, entry);
  return entry;
}

// Lienzos auxiliares para teñir de blanco un cuadro (destello de impacto), uno por hoja
const flashCanvases = new Map<string, HTMLCanvasElement>();

export interface SpriteDrawOptions {
  scale?: number;  // Multiplicador sobre la escala de la hoja
  flash?: boolean; // Pinta el cuadro completamente blanco
  tint?: string;   // Igual que flash pero del color indicado (imágenes fantasma)
  alpha?: number;
  // Deformaciones para dar vida a las poses (estirar al saltar, aplastar al caer, inclinarse al correr)
  scaleX?: number;   // Multiplicador horizontal (desde los pies)
  scaleY?: number;   // Multiplicador vertical (desde los pies)
  rotation?: number; // Radianes; positivo = inclinarse hacia donde mira
  pivot?: number;    // Altura del eje de giro como fracción del cuadro (0 = pies, 0.5 = cintura)
}

// Dibuja un cuadro de la hoja con los pies en (x, y), mirando a la derecha (facing 1) o a la izquierda (-1)
export function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheetEntry,
  cfg: SpriteSheetConfig,
  row: number,
  frame: number,
  x: number,
  y: number,
  facing: 1 | -1,
  options: SpriteDrawOptions = {}
) {
  const { frameWidth: fw, frameHeight: fh } = cfg;
  const scale = cfg.scale * (options.scale ?? 1);
  const drawW = fw * scale;
  const drawH = fh * scale;
  const sx = frame * fw;
  const sy = row * fh;

  let source: CanvasImageSource = sheet.image;
  let srcX = sx;
  let srcY = sy;
  if (options.flash || options.tint) {
    let canvas = flashCanvases.get(cfg.src);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = fw;
      canvas.height = fh;
      flashCanvases.set(cfg.src, canvas);
    }
    const fctx = canvas.getContext('2d');
    if (fctx) {
      fctx.globalCompositeOperation = 'source-over';
      fctx.clearRect(0, 0, fw, fh);
      fctx.drawImage(sheet.image, sx, sy, fw, fh, 0, 0, fw, fh);
      fctx.globalCompositeOperation = 'source-atop';
      fctx.fillStyle = options.tint ?? '#ffffff';
      fctx.fillRect(0, 0, fw, fh);
      source = canvas;
      srcX = 0;
      srcY = 0;
    }
  }

  ctx.save();
  ctx.translate(x, y);
  if (options.rotation) {
    const pivotY = -drawH * (options.pivot ?? 0.45);
    ctx.translate(0, pivotY);
    ctx.rotate(options.rotation * facing);
    ctx.translate(0, -pivotY);
  }
  ctx.scale(facing * (options.scaleX ?? 1), options.scaleY ?? 1);
  ctx.globalAlpha *= options.alpha ?? 1;
  ctx.imageSmoothingEnabled = !cfg.pixelArt;
  ctx.drawImage(source, srcX, srcY, fw, fh, -drawW / 2, -drawH + cfg.footOffset * scale, drawW, drawH);
  ctx.restore();
}
