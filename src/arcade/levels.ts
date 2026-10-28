import type { Pantheon } from '../game/deities';

// ==========================================================================
// DATOS DEL MODO ARCADE: NIVELES, MONSTRUOS, OLEADAS Y JEFES
// ==========================================================================

export type MonsterKind = 'grunt' | 'brute' | 'runner' | 'thief';

// Aspecto procedural de un monstruo (se dibuja con formas hasta tener hojas de sprites propias)
export interface MonsterSkin {
  name: string;
  spriteId?: string; // Nombre de su hoja en public/sprites/monsters (sin extensión)
  body: string;   // Color principal
  detail: string; // Color secundario (armadura, vendas, manchas)
  accent: string; // Ojos y brillos
  head: 'skull' | 'helmet' | 'mummy' | 'oni' | 'bull' | 'jackal' | 'jaguar' | 'imp' | 'hood';
  weapon: 'spear' | 'claws' | 'club' | 'axe' | 'khopesh' | 'kanabo' | 'none';
  extra?: 'shield' | 'wings' | 'shell' | 'bandages' | 'spots' | 'sack';
}

export interface MonsterStats {
  hp: number;
  speed: number;
  damage: number;
  reach: number;   // Alcance horizontal del golpe
  windup: number;  // Ticks de aviso antes de golpear
  recover: number; // Ticks vulnerables tras golpear
  width: number;
  height: number;
  armor: boolean;  // No se inmuta con golpes ligeros
  score: number;
}

export const MONSTER_STATS: Record<MonsterKind, MonsterStats> = {
  grunt: { hp: 36, speed: 1.6, damage: 7, reach: 80, windup: 22, recover: 26, width: 54, height: 150, armor: false, score: 100 },
  brute: { hp: 90, speed: 1.05, damage: 13, reach: 104, windup: 34, recover: 34, width: 84, height: 190, armor: true, score: 300 },
  runner: { hp: 22, speed: 2.9, damage: 5, reach: 62, windup: 12, recover: 30, width: 46, height: 115, armor: false, score: 80 },
  thief: { hp: 30, speed: 3.2, damage: 0, reach: 0, windup: 0, recover: 0, width: 44, height: 100, armor: false, score: 200 }
};

// Hojas de monstruos ya procesadas con tools/process_sprites.py y copiadas a public/sprites/monsters.
// Los datos salen de su _meta.json; los monstruos que no estén aquí se siguen dibujando por código.
// pixelArt: hojas pequeñas que se amplían sin suavizado para no verse borrosas.
export const MONSTER_SPRITES: Record<string, { frameWidth: number; frameHeight: number; idleHeight: number; pixelArt?: boolean }> = {
  hoplita: { frameWidth: 460, frameHeight: 202, idleHeight: 198 },
  momia: { frameWidth: 460, frameHeight: 200, idleHeight: 189 },
  minotauro: { frameWidth: 398, frameHeight: 217, idleHeight: 210.5 },
  'duende-ladron': { frameWidth: 450, frameHeight: 179, idleHeight: 158 },
  arpia: { frameWidth: 414, frameHeight: 180, idleHeight: 155.5 }
};

// --- BESTIAS DE MONTA (una por panteón) ---
// Hojas 4x4 en public/sprites/beasts (quieto, correr, atacar, golpeada) con la montura vacía.
// seat: centro de la montura medido en la hoja (px desde el eje del cuerpo y desde los pies).
export type BeastAttack = 'fire' | 'tail' | 'pounce' | 'thunder';

export interface BeastDef {
  id: string;
  name: string;
  frameWidth: number;
  frameHeight: number;
  idleHeight: number;
  height: number; // Altura en pantalla de la pose de reposo
  seat: { dx: number; dy: number };
  attack: BeastAttack;
  color: string;  // Color de su ataque (fuego, rayo...)
}

export const BEASTS: Record<Pantheon, BeastDef> = {
  Grecia: { id: 'cerbero', name: 'Cerbero', frameWidth: 326, frameHeight: 225, idleHeight: 175, height: 155, seat: { dx: -8, dy: 100 }, attack: 'fire', color: '#f97316' },
  Egipto: { id: 'cocodrilo', name: 'Cocodrilo de Sobek', frameWidth: 304, frameHeight: 159, idleHeight: 89, height: 92, seat: { dx: 10, dy: 70 }, attack: 'tail', color: '#d6a75c' },
  México: { id: 'jaguar', name: 'Jaguar de Guerra', frameWidth: 266, frameHeight: 131, idleHeight: 110, height: 125, seat: { dx: 2, dy: 72 }, attack: 'pounce', color: '#14b8a6' },
  Japón: { id: 'kirin', name: 'Kirin', frameWidth: 278, frameHeight: 203, idleHeight: 165.5, height: 170, seat: { dx: -2, dy: 92 }, attack: 'thunder', color: '#60a5fa' }
};

// El duende ladrón es igual en todos los niveles: suelta vasijas de magia y comida al golpearlo
export const THIEF_SKIN: MonsterSkin = {
  name: 'Duende Ladrón', spriteId: 'duende-ladron',
  body: '#1d4ed8',
  detail: '#92400e',
  accent: '#fde68a',
  head: 'hood',
  weapon: 'none',
  extra: 'sack'
};

export interface LevelTheme {
  skyTop: string;
  skyBottom: string;
  sun: string;
  far: string;   // Siluetas lejanas
  mid: string;   // Elementos del plano medio
  floor: string;
  floorLine: string;
  wall: string;  // Franja trasera del suelo
}

export type BossSpecial = 'charge' | 'orb' | 'thunder' | 'slam';

// Escenario pintado (en public/backgrounds). Sin él, el nivel se dibuja por código con su LevelTheme.
export interface LevelArt {
  background?: string; // Panorama del cielo y el paisaje
  horizonY?: number;   // Fila de la imagen de fondo donde empieza el suelo
  floor?: string;      // Pieza de suelo que se repite en horizontal (vista desde arriba)
}

export interface LevelDef {
  pantheon: Pantheon;
  title: string;
  subtitle: string;
  theme: LevelTheme;
  skins: Record<Exclude<MonsterKind, 'thief'>, MonsterSkin>;
  bossOrder: string[]; // Candidatos a jefe en orden de preferencia (se salta al dios que controla el jugador)
  art?: LevelArt;
}

// Poderes de cada dios cuando actúa como jefe
export const BOSS_SPECIALS: Record<string, BossSpecial[]> = {
  zeus: ['thunder', 'charge'],
  hades: ['orb', 'slam'],
  poseidon: ['charge', 'slam'],
  ra: ['orb', 'thunder'],
  anubis: ['charge', 'orb'],
  osiris: ['slam', 'orb'],
  quetzalcoatl: ['charge', 'orb'],
  huitzilopochtli: ['orb', 'charge'],
  mictlantecuhtli: ['orb', 'slam'],
  amaterasu: ['orb', 'charge'],
  susanoo: ['charge', 'slam'],
  raijin: ['thunder', 'slam']
};

export const LEVELS: LevelDef[] = [
  {
    pantheon: 'Grecia',
    title: 'Ruinas del Olimpo',
    subtitle: 'Las legiones del inframundo griego asaltan el monte sagrado',
    theme: {
      skyTop: '#312e81',
      skyBottom: '#fb923c',
      sun: '#fde68a',
      far: '#4c1d95',
      mid: '#e2e8f0',
      floor: '#a8a29e',
      floorLine: '#78716c',
      wall: '#57534e'
    },
    skins: {
      grunt: { name: 'Esqueleto Hoplita', spriteId: 'hoplita', body: '#e7e5e4', detail: '#b45309', accent: '#ef4444', head: 'helmet', weapon: 'spear', extra: 'shield' },
      brute: { name: 'Minotauro', spriteId: 'minotauro', body: '#78350f', detail: '#a8a29e', accent: '#fbbf24', head: 'bull', weapon: 'axe' },
      runner: { name: 'Arpía', spriteId: 'arpia', body: '#7c3aed', detail: '#c4b5fd', accent: '#fde047', head: 'imp', weapon: 'claws', extra: 'wings' }
    },
    bossOrder: ['hades', 'poseidon', 'zeus'],
    art: { background: 'grecia-fondo.webp', horizonY: 718, floor: 'grecia-suelo.png' }
  },
  {
    pantheon: 'Egipto',
    title: 'Desierto de la Duat',
    subtitle: 'Las momias custodian el camino al juicio de los muertos',
    theme: {
      skyTop: '#0c4a6e',
      skyBottom: '#fcd34d',
      sun: '#fef3c7',
      far: '#b45309',
      mid: '#d97706',
      floor: '#d6a75c',
      floorLine: '#a16207',
      wall: '#92400e'
    },
    skins: {
      grunt: { name: 'Momia', spriteId: 'momia', body: '#d6cfa8', detail: '#a8a29e', accent: '#22c55e', head: 'mummy', weapon: 'claws', extra: 'bandages' },
      brute: { name: 'Guardián Chacal', spriteId: 'guardian-chacal', body: '#1c1917', detail: '#facc15', accent: '#f97316', head: 'jackal', weapon: 'khopesh' },
      runner: { name: 'Sombra de Set', spriteId: 'sombra-set', body: '#292524', detail: '#7f1d1d', accent: '#ef4444', head: 'imp', weapon: 'claws' }
    },
    bossOrder: ['anubis', 'osiris', 'ra'],
    art: { background: 'egipto-fondo.webp', horizonY: 730, floor: 'egipto-suelo.png' }
  },
  {
    pantheon: 'México',
    title: 'Calzada al Mictlán',
    subtitle: 'Los guerreros calavera emergen de los nueve niveles del inframundo',
    theme: {
      skyTop: '#022c22',
      skyBottom: '#166534',
      sun: '#fef9c3',
      far: '#064e3b',
      mid: '#78716c',
      floor: '#57534e',
      floorLine: '#292524',
      wall: '#365314'
    },
    skins: {
      grunt: { name: 'Guerrero Calavera', spriteId: 'guerrero-calavera', body: '#3f2a1d', detail: '#e7e5e4', accent: '#f97316', head: 'skull', weapon: 'club' },
      brute: { name: 'Guerrero Jaguar', spriteId: 'guerrero-jaguar', body: '#ca8a04', detail: '#1c1917', accent: '#22c55e', head: 'jaguar', weapon: 'club', extra: 'spots' },
      runner: { name: 'Tzitzimitl', spriteId: 'tzitzimitl', body: '#1e1b4b', detail: '#e7e5e4', accent: '#a855f7', head: 'skull', weapon: 'claws', extra: 'wings' }
    },
    bossOrder: ['mictlantecuhtli', 'quetzalcoatl', 'huitzilopochtli'],
    art: { background: 'mexico-fondo.webp', horizonY: 694, floor: 'mexico-suelo.png' }
  },
  {
    pantheon: 'Japón',
    title: 'Santuario de la Tormenta',
    subtitle: 'Los oni descienden de las nubes junto con los truenos',
    theme: {
      skyTop: '#1e1b4b',
      skyBottom: '#be185d',
      sun: '#fecaca',
      far: '#312e81',
      mid: '#b91c1c',
      floor: '#3f3f46',
      floorLine: '#27272a',
      wall: '#18181b'
    },
    skins: {
      grunt: { name: 'Oni Menor', spriteId: 'oni-menor', body: '#b91c1c', detail: '#1c1917', accent: '#fde047', head: 'oni', weapon: 'kanabo' },
      brute: { name: 'Oni Mayor', spriteId: 'oni-mayor', body: '#1d4ed8', detail: '#292524', accent: '#fde047', head: 'oni', weapon: 'kanabo' },
      runner: { name: 'Kappa', spriteId: 'kappa', body: '#15803d', detail: '#a16207', accent: '#fef08a', head: 'imp', weapon: 'claws', extra: 'shell' }
    },
    bossOrder: ['raijin', 'susanoo', 'amaterasu'],
    art: { background: 'japon-fondo.webp', horizonY: 718, floor: 'japon-suelo.png' }
  }
];

// --- OLEADAS ---
export interface WaveSpawn {
  kind: MonsterKind;
  side: 'left' | 'right';
  delay: number; // Ticks desde el inicio de la oleada
  zFrac: number; // Profundidad de aparición (0 = fondo, 1 = frente)
  mounted?: boolean; // Llega montado en la bestia del panteón
}

export interface Wave {
  camX: number; // La cámara se bloquea aquí y aparecen los monstruos
  spawns: WaveSpawn[];
}

export const LEVEL_LENGTH = 4200;
export const BOSS_CAM_X = LEVEL_LENGTH - 1280;

// Oleadas crecientes por nivel: más soldados, corredores desde el nivel 2 y brutos en las oleadas finales
export function buildWaves(levelIndex: number): Wave[] {
  const positions = [450, 1150, 1850, 2500];
  return positions.map((camX, k) => {
    const spawns: WaveSpawn[] = [];
    let delay = 0;
    const push = (kind: MonsterKind, count: number) => {
      for (let i = 0; i < count; i++) {
        spawns.push({
          kind,
          side: spawns.length % 2 === 0 ? 'right' : 'left',
          delay,
          zFrac: (spawns.length * 0.37 + 0.15) % 1
        });
        delay += 45;
      }
    };

    push('grunt', 2 + Math.floor((k + levelIndex) / 2));
    push('runner', (k % 2 === 1 ? 2 : 0) + (levelIndex >= 2 ? 1 : 0));
    push('brute', k >= 2 ? 1 + (levelIndex >= 3 && k === 3 ? 1 : 0) : levelIndex >= 1 && k === 1 ? 1 : 0);
    // Jinetes: uno en la 2.ª oleada de cada nivel y otro en la última desde el nivel 3
    if (k === 1 || (k === 3 && levelIndex >= 2)) spawns.push({ kind: 'grunt', side: 'right', delay: 120, zFrac: 0.5, mounted: true });
    // Un duende ladrón por oleada (dos en la última) para ir juntando magia y comida
    spawns.push({ kind: 'thief', side: 'right', delay: 30, zFrac: 0.55 });
    if (k === positions.length - 1) spawns.push({ kind: 'thief', side: 'right', delay: 260, zFrac: 0.25 });
    return { camX, spawns };
  });
}
