// ==========================================================================
// TORRE DE LOS DIOSES: 8 pisos de versus contra la IA y Origen en la cima
// ==========================================================================
import { DEITIES } from './deities';
import type { DeityData, Pantheon } from './deities';

export const TOWER_FLOORS = 8;   // Rivales antes de Origen
export const TOWER_CONTINUES = 3;

export interface TowerRun {
  hero: DeityData;
  rivals: DeityData[]; // 8 dioses y, al final, Origen
  floor: number;       // Índice del rival actual
  continues: number;
}

const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// Dos rivales al azar de cada reino (sin el dios del jugador), en reinos de orden aleatorio
export function buildTower(hero: DeityData, finalBoss: DeityData): TowerRun {
  const pantheons: Pantheon[] = shuffle(['Grecia', 'Egipto', 'México', 'Japón']);
  const rivals = pantheons.flatMap(p => shuffle(DEITIES.filter(d => d.pantheon === p && d.id !== hero.id)).slice(0, 2));
  return { hero, rivals: [...rivals, finalBoss], floor: 0, continues: TOWER_CONTINUES };
}

// Qué tan lista es la IA en cada piso (0 = torpe, 1 = implacable)
export function towerSkill(floor: number): number {
  return Math.min(1, floor / (TOWER_FLOORS - 1));
}

// Final de cada dios al vencer a Origen
export const TOWER_ENDINGS: Record<string, string> = {
  zeus: 'Con Origen vencido, Zeus reclamó el telar del cosmos para el Olimpo. Pero al tocar sus hilos comprendió que ningún trono es eterno, y por primera vez el rey de los dioses decidió gobernar escuchando.',
  hades: 'Hades guardó el último hilo de Origen en lo más profundo del Tártaro. Desde entonces ninguna alma se pierde entre mundos: el señor de los muertos se volvió el guardián de todos los finales.',
  poseidon: 'Poseidón llevó los hilos del cosmos al fondo del océano y tejió con ellos nuevas mareas. Los marineros de todos los reinos dicen que, en las noches tranquilas, el mar canta la canción del creador.',
  ra: 'Ra encendió un nuevo sol con la luz que Origen dejó al caer. Desde ese día su barca no solo cruza el cielo de Egipto, sino el de los cuatro reinos, y ninguna noche vuelve a ser eterna.',
  anubis: 'Anubis pesó el corazón del propio creador y lo encontró más ligero que una pluma. Lo dejó partir en paz, y desde entonces el juicio de los muertos es también el juicio de los dioses.',
  osiris: 'Osiris, que ya conocía la muerte, enseñó a Origen a renacer. Juntos plantaron un nuevo jardín en el telar del cosmos, donde cada mundo que termina vuelve a brotar.',
  quetzalcoatl: 'Quetzalcóatl tomó el viento que soplaba entre los hilos del cosmos y lo llevó a los cuatro reinos. Con él llegaron el conocimiento y las estrellas nuevas: la Serpiente Emplumada volvió a ser el maestro de todos.',
  huitzilopochtli: 'Huitzilopochtli venció al creador sin retroceder un paso. El sol guerrero ardió más fuerte que nunca, y los cuatro reinos juraron que, mientras él luche, la luz jamás será vencida.',
  mictlantecuhtli: 'Mictlantecuhtli abrió las puertas del Mictlán para recibir a Origen. El creador descansó entre los huesos de los mundos antiguos, y el señor de la muerte se volvió el custodio del fin y del principio.',
  amaterasu: 'Amaterasu salió de la cueva del cosmos llevando la luz de Origen en su espejo. Los cuatro reinos amanecieron al mismo tiempo, y su reflejo se convirtió en el primer día de una nueva era.',
  susanoo: 'Susanoo partió en dos la tormenta del creador y de su interior sacó una espada hecha de estrellas. Desde entonces, el dios de las tempestades protege el telar contra cualquiera que quiera destejerlo.',
  raijin: 'Raijin tocó sus tambores sobre las ruinas del telar y el trueno se escuchó en todos los mundos a la vez. Fue la señal: el torneo había terminado y los dioses de los cuatro reinos al fin estaban en paz.'
};
