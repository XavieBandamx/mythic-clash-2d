import type { DeityData, Pantheon } from '../game/deities';

// ==========================================================================
// DATOS DEL MODO ARCADE: NIVELES, MONSTRUOS, OLEADAS Y JEFES
// ==========================================================================

export type MonsterKind = 'grunt' | 'brute' | 'runner' | 'thief' | 'mini';

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
  thief: { hp: 30, speed: 3.2, damage: 0, reach: 0, windup: 0, recover: 0, width: 44, height: 100, armor: false, score: 200 },
  // Mini-jefe a mitad de nivel: grande, con armadura y golpes que derriban
  mini: { hp: 320, speed: 1.15, damage: 15, reach: 140, windup: 30, recover: 32, width: 110, height: 240, armor: true, score: 2500 }
};

// Hojas de monstruos ya procesadas con tools/process_sprites.py y copiadas a public/sprites/monsters.
// Los datos salen de su _meta.json; los monstruos que no estén aquí se siguen dibujando por código.
// pixelArt: hojas pequeñas que se amplían sin suavizado para no verse borrosas.
export const MONSTER_SPRITES: Record<string, { frameWidth: number; frameHeight: number; idleHeight: number; pixelArt?: boolean }> = {
  hoplita: { frameWidth: 460, frameHeight: 202, idleHeight: 198 },
  momia: { frameWidth: 460, frameHeight: 200, idleHeight: 189 },
  minotauro: { frameWidth: 398, frameHeight: 217, idleHeight: 210.5 },
  'duende-ladron': { frameWidth: 450, frameHeight: 179, idleHeight: 158 },
  arpia: { frameWidth: 414, frameHeight: 180, idleHeight: 155.5 },
  'guardian-chacal': { frameWidth: 450, frameHeight: 221, idleHeight: 214.5 },
  'sombra-set': { frameWidth: 388, frameHeight: 195, idleHeight: 190.5 },
  'guerrero-calavera': { frameWidth: 448, frameHeight: 214, idleHeight: 210 },
  'guerrero-jaguar': { frameWidth: 244, frameHeight: 144, idleHeight: 133 },
  tzitzimitl: { frameWidth: 236, frameHeight: 136, idleHeight: 132 },
  'oni-menor': { frameWidth: 220, frameHeight: 140, idleHeight: 128.5 },
  kappa: { frameWidth: 216, frameHeight: 131, idleHeight: 127 },
  'oni-mayor': { frameWidth: 220, frameHeight: 142, idleHeight: 128.5 },
  ciclope: { frameWidth: 506, frameHeight: 260, idleHeight: 247 },
  escorpion: { frameWidth: 558, frameHeight: 260, idleHeight: 244 },
  'guerrero-aguila': { frameWidth: 528, frameHeight: 265, idleHeight: 260 },
  'oni-gigante': { frameWidth: 498, frameHeight: 268, idleHeight: 258 }
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

export type BossSpecial = 'charge' | 'orb' | 'thunder' | 'slam' | 'teleport' | 'collapse';

// Escenario pintado (en public/backgrounds). Sin él, el nivel se dibuja por código con su LevelTheme.
export interface LevelArt {
  background?: string; // Panorama del cielo y el paisaje
  horizonY?: number;   // Fila de la imagen de fondo donde empieza el suelo
  floor?: string;      // Pieza de suelo que se repite en horizontal (vista desde arriba)
  platform?: boolean;  // La imagen trae su propio suelo: arena fija de una pantalla, sin pieza de suelo
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
      runner: { name: 'Arpía', spriteId: 'arpia', body: '#7c3aed', detail: '#c4b5fd', accent: '#fde047', head: 'imp', weapon: 'claws', extra: 'wings' },
      mini: { name: 'Cíclope', spriteId: 'ciclope', body: '#6b7f5e', detail: '#78350f', accent: '#f97316', head: 'bull', weapon: 'club' }
    },
    bossOrder: ['hades', 'poseidon', 'zeus'],
    art: { background: 'grecia-fondo.webp', horizonY: 718, floor: 'grecia-suelo.webp' }
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
      runner: { name: 'Sombra de Set', spriteId: 'sombra-set', body: '#292524', detail: '#7f1d1d', accent: '#ef4444', head: 'imp', weapon: 'claws' },
      mini: { name: 'Escorpión Gigante', spriteId: 'escorpion', body: '#1c1917', detail: '#facc15', accent: '#fde047', head: 'jackal', weapon: 'claws' }
    },
    bossOrder: ['anubis', 'osiris', 'ra'],
    art: { background: 'egipto-fondo.webp', horizonY: 730, floor: 'egipto-suelo.webp' }
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
      runner: { name: 'Tzitzimitl', spriteId: 'tzitzimitl', body: '#1e1b4b', detail: '#e7e5e4', accent: '#a855f7', head: 'skull', weapon: 'claws', extra: 'wings' },
      mini: { name: 'Guerrero Águila', spriteId: 'guerrero-aguila', body: '#78350f', detail: '#e7e5e4', accent: '#facc15', head: 'jaguar', weapon: 'club', extra: 'wings' }
    },
    bossOrder: ['mictlantecuhtli', 'quetzalcoatl', 'huitzilopochtli'],
    art: { background: 'mexico-fondo.webp', horizonY: 694, floor: 'mexico-suelo.webp' }
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
      runner: { name: 'Kappa', spriteId: 'kappa', body: '#15803d', detail: '#a16207', accent: '#fef08a', head: 'imp', weapon: 'claws', extra: 'shell' },
      mini: { name: 'Oni Gigante', spriteId: 'oni-gigante', body: '#7e22ce', detail: '#292524', accent: '#fde047', head: 'oni', weapon: 'kanabo' }
    },
    bossOrder: ['raijin', 'susanoo', 'amaterasu'],
    art: { background: 'japon-fondo.webp', horizonY: 718, floor: 'japon-suelo.webp' }
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

// --- JEFE FINAL: ORIGEN, EL TEJEDOR DE MUNDOS (no seleccionable) ---
export const ORIGEN: DeityData = {
  id: 'origen',
  name: 'Origen',
  pantheon: 'Grecia', // Sin reino propio; el campo solo lo exige el tipo
  title: 'El Tejedor de Mundos',
  lore: 'Existía antes que todos los panteones y tejió el cosmos con hilos de luz. Ha despertado para deshacer su obra.',
  specialName: 'Colapso del Cosmos',
  specialDesc: 'Deshace el universo; solo un círculo de luz queda a salvo.',
  primaryColor: '#4c1d95',
  secondaryColor: '#1e1b4b',
  accentColor: '#fbbf24',
  auraColor: 'rgba(167, 139, 250, 0.45)',
  stats: { attack: 10, speed: 6, defense: 10 },
  style: 'Guardián',
  passive: { name: 'Tejedor de Mundos', desc: 'Al canalizar sus poderes descubre su máscara y recibe el doble de daño.' },
  isUnique: true
};

// Poderes de Origen según la vida que le queda (de más a menos): cada fase suma presión
export function origenSpecials(hpFrac: number): BossSpecial[] {
  if (hpFrac > 0.75) return ['orb', 'teleport'];
  if (hpFrac > 0.5) return ['orb', 'thunder', 'teleport'];
  if (hpFrac > 0.25) return ['thunder', 'teleport', 'orb'];
  return ['collapse', 'collapse', 'thunder', 'teleport'];
}

// Nivel 5: una sola pantalla en el Telar del Cosmos, sin oleadas; sus refuerzos son ecos de los cuatro reinos
export const FINAL_LEVEL: LevelDef = {
  pantheon: 'Grecia',
  title: 'El Telar del Cosmos',
  subtitle: 'Más allá de los reinos, el creador despierta',
  theme: {
    skyTop: '#0b0620',
    skyBottom: '#2e1065',
    sun: '#fbbf24',
    far: '#1e1b4b',
    mid: '#4c1d95',
    floor: '#1c1917',
    floorLine: '#fbbf24',
    wall: '#0c0a09'
  },
  skins: {
    grunt: { name: 'Eco Hoplita', spriteId: 'hoplita', body: '#e7e5e4', detail: '#b45309', accent: '#ef4444', head: 'helmet', weapon: 'spear', extra: 'shield' },
    brute: { name: 'Eco del Minotauro', spriteId: 'minotauro', body: '#78350f', detail: '#a8a29e', accent: '#fbbf24', head: 'bull', weapon: 'axe' },
    runner: { name: 'Eco Arpía', spriteId: 'arpia', body: '#7c3aed', detail: '#c4b5fd', accent: '#fde047', head: 'imp', weapon: 'claws', extra: 'wings' },
    mini: { name: 'Eco del Cíclope', spriteId: 'ciclope', body: '#6b7f5e', detail: '#78350f', accent: '#f97316', head: 'bull', weapon: 'club' }
  },
  bossOrder: ['origen'],
  art: { background: 'telar-fondo.webp', horizonY: 548, platform: true }
};

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
    // Mini-jefe en la 3.ª oleada: rompe la rutina a mitad del nivel
    if (k === 2) spawns.push({ kind: 'mini', side: 'right', delay: delay + 60, zFrac: 0.5 });
    // Un duende ladrón por oleada (dos en la última) para ir juntando magia y comida
    spawns.push({ kind: 'thief', side: 'right', delay: 30, zFrac: 0.55 });
    if (k === positions.length - 1) spawns.push({ kind: 'thief', side: 'right', delay: 260, zFrac: 0.25 });
    return { camX, spawns };
  });
}
