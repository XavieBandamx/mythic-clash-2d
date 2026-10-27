import type { DeityData } from './deities';

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

// Plantilla común: una hoja por deidad en public/sprites/<id>.png, una fila por animación
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
  // A 8 ticks por cuadro un golpe ligero (14 de hitstun) solo muestra el retroceso; los fuertes llegan al derribo
  hit: { row: 3, frames: 4, frameDuration: 8, loop: false }
};

// Ajustes por deidad. Las hojas de public/sprites se generan con tools/process_sprites.py, que deja los pies
// pegados al borde inferior de cada celda (footOffset 0) y el cuerpo centrado en horizontal.
// La fila de golpe varía según la hoja: unas terminan tendidas (cuadro 3) y otras traen tendido (2) + levantándose (3).
// scale = 175 px de altura en idle / altura medida del idle, × 1.08 para Poseidón y Hades y × 1.2 para Raijin
// (dioses corpulentos; el aro de tambores de Raijin infla su altura medida).
export const SPRITE_SHEET_OVERRIDES: Record<string, Partial<SpriteSheetConfig>> = {
  amaterasu: { frameWidth: 236, frameHeight: 137, scale: 1.33, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  anubis: { frameWidth: 284, frameHeight: 138, scale: 1.38, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS, lyingFrame: 2, getupFrame: 3 },
  hades: { frameWidth: 222, frameHeight: 133, scale: 1.5, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  huitzilopochtli: { frameWidth: 286, frameHeight: 140, scale: 1.31, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS, lyingFrame: 2, getupFrame: 3 },
  mictlantecuhtli: { frameWidth: 292, frameHeight: 138, scale: 1.32, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  osiris: { frameWidth: 292, frameHeight: 149, scale: 1.29, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS, lyingFrame: 2, getupFrame: 3 },
  poseidon: { frameWidth: 318, frameHeight: 127, scale: 1.54, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  quetzalcoatl: { frameWidth: 202, frameHeight: 127, scale: 1.43, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  ra: { frameWidth: 306, frameHeight: 136, scale: 1.33, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  raijin: { frameWidth: 252, frameHeight: 162, scale: 1.33, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  susanoo: { frameWidth: 306, frameHeight: 136, scale: 1.33, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS },
  zeus: { frameWidth: 316, frameHeight: 117, scale: 1.64, footOffset: 0, pixelArt: false, animations: GRID_4X4_ANIMATIONS, lyingFrame: 2, getupFrame: 3 }
};

export function getSpriteSheetConfig(deity: DeityData): SpriteSheetConfig {
  return {
    ...DEFAULT_SPRITE_LAYOUT,
    src: `${import.meta.env.BASE_URL}sprites/${deity.id}.png`,
    ...SPRITE_SHEET_OVERRIDES[deity.id]
  };
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
