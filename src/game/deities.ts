export type Pantheon = 'Grecia' | 'Egipto' | 'México' | 'Japón';

export interface DeityStats {
  attack: number;
  speed: number;
  defense: number;
}

export interface DeityData {
  id: string;
  name: string;
  pantheon: Pantheon;
  title: string;
  lore: string;
  specialName: string;
  specialDesc: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  auraColor: string;
  stats: DeityStats;
  isUnique: boolean;
}

// Base de Datos de los 12 Dioses
export const DEITIES: DeityData[] = [
  // Grecia
  {
    id: 'zeus',
    name: 'Zeus',
    pantheon: 'Grecia',
    title: 'Rey del Olimpo y Señor del Rayo',
    lore: 'Soberano supremo del Monte Olimpo. Comanda los cielos y castiga a sus rivales empuñando el rayo primordial forjado por los Cíclopes.',
    specialName: 'Ira del Olimpo',
    specialDesc: 'Invoca 3 colosales rayos celestiales consecutivos con ondas expansivas de plasma que azotan toda la arena.',
    primaryColor: '#ffffff',
    secondaryColor: '#facc15',
    accentColor: '#38bdf8',
    auraColor: 'rgba(56, 189, 248, 0.55)',
    stats: { attack: 5, speed: 4, defense: 3 },
    isUnique: true
  },
  {
    id: 'hades',
    name: 'Hades',
    pantheon: 'Grecia',
    title: 'Señor del Inframundo y las Sombras',
    lore: 'Custodio implacable del Tártaro y las riquezas de la tierra profunda. Empuña el bidente de obsidiana y llamas espectrales.',
    specialName: 'Niebla del Tártaro',
    specialDesc: 'Llamas oscuras espectrales que engullen al oponente en tinieblas y desgarro continuo.',
    primaryColor: '#18181b',
    secondaryColor: '#991b1b',
    accentColor: '#c084fc',
    auraColor: 'rgba(192, 132, 252, 0.45)',
    stats: { attack: 4, speed: 3, defense: 5 },
    isUnique: false
  },
  {
    id: 'poseidon',
    name: 'Poseidón',
    pantheon: 'Grecia',
    title: 'Soberano de los Mares y Terremotos',
    lore: 'Portador del tridente sagrado con el que despierta maremotos titánicos y agrieta los cimientos de la tierra.',
    specialName: 'Maremoto Sísmico',
    specialDesc: 'Embestida acuática torrencial que expulsa al rival con furia oceánica y olas de presión.',
    primaryColor: '#0284c7',
    secondaryColor: '#0d9488',
    accentColor: '#67e8f9',
    auraColor: 'rgba(6, 182, 212, 0.45)',
    stats: { attack: 4, speed: 4, defense: 4 },
    isUnique: false
  },

  // Egipto
  {
    id: 'ra',
    name: 'Ra',
    pantheon: 'Egipto',
    title: 'Dios Primordial del Sol y la Creación',
    lore: 'Halcón solar divino que surca los cielos en la barca Mandjet. Desintegra las tinieblas con calor supernova y el báculo Was.',
    specialName: 'Amanecer del Juicio',
    specialDesc: 'Se eleva desplegando alas doradas y desata un colosal haz de plasma solar continuo que atraviesa toda la pantalla.',
    primaryColor: '#eab308',
    secondaryColor: '#dc2626',
    accentColor: '#fb923c',
    auraColor: 'rgba(234, 179, 8, 0.65)',
    stats: { attack: 5, speed: 3, defense: 4 },
    isUnique: true
  },
  {
    id: 'anubis',
    name: 'Anubis',
    pantheon: 'Egipto',
    title: 'Guardián del Duat y Juez de las Almas',
    lore: 'Custodio del pesaje del corazón frente a la pluma de la verdad. Su agilidad felina y garras funerarias no conocen piedad.',
    specialName: 'Balanza del Destino',
    specialDesc: 'Garras funerarias que desgarran la energía vital del oponente y reducen su movilidad.',
    primaryColor: '#27272a',
    secondaryColor: '#ca8a04',
    accentColor: '#facc15',
    auraColor: 'rgba(250, 204, 21, 0.4)',
    stats: { attack: 4, speed: 5, defense: 3 },
    isUnique: false
  },
  {
    id: 'osiris',
    name: 'Osiris',
    pantheon: 'Egipto',
    title: 'Señor del Renacimiento y la Eternidad',
    lore: 'Gobernante del más allá y la fertilidad sagrada. Porta el cetro de la inmortalidad y la corona Atef de plumas sagradas.',
    specialName: 'Códice Eterno',
    specialDesc: 'Pilares de arena mística y loto sagrado que repelen todo ataque con barrera regenerativa.',
    primaryColor: '#15803d',
    secondaryColor: '#d97706',
    accentColor: '#4ade80',
    auraColor: 'rgba(74, 222, 128, 0.45)',
    stats: { attack: 3, speed: 3, defense: 5 },
    isUnique: false
  },

  // México
  {
    id: 'quetzalcoatl',
    name: 'Quetzalcóatl',
    pantheon: 'México',
    title: 'La Serpiente Emplumada y Dios del Viento',
    lore: 'Portador de la sabiduría, las artes y la luz matutina. Sus plumas de jade desatan vendavales que despedazan cualquier defensa.',
    specialName: 'Vórtice de Jade',
    specialDesc: 'Ciclón místico de plumas esmeralda que eleva y azota al rival en un torbellino implacable.',
    primaryColor: '#059669',
    secondaryColor: '#10b981',
    accentColor: '#f43f5e',
    auraColor: 'rgba(16, 185, 129, 0.5)',
    stats: { attack: 4, speed: 5, defense: 3 },
    isUnique: false
  },
  {
    id: 'huitzilopochtli',
    name: 'Huitzilopochtli',
    pantheon: 'México',
    title: 'Dios Solar de la Guerra y el Coraje',
    lore: 'Guerrero celeste mexica. Empuña a Xiuhcóatl, la serpiente de fuego, liderando a las fuerzas del sol contra la noche eterna.',
    specialName: 'Llamarada Xiuhcóatl',
    specialDesc: 'Embestida ígnea incandescente impulsada por el furor guerrero y llamas de obsidiana.',
    primaryColor: '#0891b2',
    secondaryColor: '#ea580c',
    accentColor: '#fbbf24',
    auraColor: 'rgba(234, 88, 12, 0.5)',
    stats: { attack: 5, speed: 4, defense: 3 },
    isUnique: false
  },
  {
    id: 'mictlantecuhtli',
    name: 'Mictlantecuhtli',
    pantheon: 'México',
    title: 'Señor del Mictlán y los Huesos Sagrados',
    lore: 'Gobernante cadavérico del noveno nivel del inframundo. Adornado con calaveras de jade, cenizas rituales y garras de ultratumba.',
    specialName: 'Desgarro del Mictlán',
    specialDesc: 'Garras óseas y sombras espectrales que brotan del suelo atrapando al rival.',
    primaryColor: '#475569',
    secondaryColor: '#b91c1c',
    accentColor: '#f87171',
    auraColor: 'rgba(185, 28, 28, 0.45)',
    stats: { attack: 4, speed: 3, defense: 5 },
    isUnique: false
  },

  // Japón
  {
    id: 'amaterasu',
    name: 'Amaterasu',
    pantheon: 'Japón',
    title: 'Diosa Celestial del Sol y la Armonía',
    lore: 'Reina de Takamagahara. Irradia la luz que dispersa toda sombra portando el sagrado espejo de bronce Yata no Kagami.',
    specialName: 'Espejo Sagrado Yata',
    specialDesc: 'Destello solar cegador que refleja cualquier ataque y aturde masivamente.',
    primaryColor: '#fff1f2',
    secondaryColor: '#e11d48',
    accentColor: '#f59e0b',
    auraColor: 'rgba(244, 63, 94, 0.45)',
    stats: { attack: 4, speed: 5, defense: 3 },
    isUnique: false
  },
  {
    id: 'susanoo',
    name: 'Susanoo',
    pantheon: 'Japón',
    title: 'Dios Valeroso de las Tormentas y el Mar',
    lore: 'Guerrero indomable de los mares y las tempestades. Portador de la espada Totsuka con la que cercenó a la mítica serpiente de ocho cabezas.',
    specialName: 'Tajo del Dragón Marino',
    specialDesc: 'Ráfaga de cortes huracanados con la hoja sagrada que generan vacío cortante.',
    primaryColor: '#312e81',
    secondaryColor: '#6366f1',
    accentColor: '#67e8f9',
    auraColor: 'rgba(99, 102, 241, 0.45)',
    stats: { attack: 5, speed: 4, defense: 3 },
    isUnique: false
  },
  {
    id: 'raijin',
    name: 'Raijin',
    pantheon: 'Japón',
    title: 'Dios del Rayo y los Tambores Taiko',
    lore: 'Espíritu de las tormentas celestiales. Sus redobles en los tambores astrales Taiko sacuden los cimientos del universo con estruendo.',
    specialName: 'Redoble Estruendoso',
    specialDesc: 'Onda expansiva sónica cargada de chispas eléctricas continuas que expulsan al rival.',
    primaryColor: '#991b1b',
    secondaryColor: '#f59e0b',
    accentColor: '#fde047',
    auraColor: 'rgba(245, 158, 11, 0.45)',
    stats: { attack: 4, speed: 3, defense: 5 },
    isUnique: false
  }
];
