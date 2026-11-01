// Datos de combate compartidos: el alcance y el riesgo pertenecen al movimiento.
export interface CombatProfile {
  plan: string;
  lightReach: number;
  heavyReach: number;
  heavyStartup: number;
  heavyDuration: number;
  heavyDamage: number;
}

export const COMBAT: Record<string, CombatProfile> = {
  zeus: { plan: 'Presiona con golpes cortos y confirma el remate de rayo.', lightReach: 76, heavyReach: 116, heavyStartup: 11, heavyDuration: 36, heavyDamage: 22 },
  hades: { plan: 'Mantente cerca: cada golpe conectado recupera vida.', lightReach: 74, heavyReach: 100, heavyStartup: 9, heavyDuration: 31, heavyDamage: 18 },
  poseidon: { plan: 'Domina la punta del tridente; el fuerte crea espacio.', lightReach: 104, heavyReach: 164, heavyStartup: 12, heavyDuration: 37, heavyDamage: 18 },
  ra: { plan: 'Conecta, aplica quemadura y controla la distancia.', lightReach: 92, heavyReach: 138, heavyStartup: 12, heavyDuration: 35, heavyDamage: 19 },
  anubis: { plan: 'Bloquea justo a tiempo para esquivar y responder.', lightReach: 68, heavyReach: 92, heavyStartup: 7, heavyDuration: 27, heavyDamage: 16 },
  osiris: { plan: 'Defiende con paciencia y castiga; tienes un renacer.', lightReach: 88, heavyReach: 126, heavyStartup: 11, heavyDuration: 34, heavyDamage: 18 },
  quetzalcoatl: { plan: 'Cambia de trayectoria con doble salto y entra desde el aire.', lightReach: 84, heavyReach: 112, heavyStartup: 8, heavyDuration: 29, heavyDamage: 17 },
  huitzilopochtli: { plan: 'Avanza y rompe la guardia; con poca vida aumenta tu daño.', lightReach: 78, heavyReach: 106, heavyStartup: 10, heavyDuration: 33, heavyDamage: 22 },
  mictlantecuhtli: { plan: 'Un bloqueo preciso devuelve daño; evita defender sin parar.', lightReach: 88, heavyReach: 128, heavyStartup: 12, heavyDuration: 35, heavyDamage: 19 },
  amaterasu: { plan: 'Combina ataques rápidos y aprovecha la carga de súper.', lightReach: 78, heavyReach: 106, heavyStartup: 8, heavyDuration: 28, heavyDamage: 16 },
  susanoo: { plan: 'Amenaza la guardia con un tajo fuerte de preparación larga.', lightReach: 86, heavyReach: 140, heavyStartup: 14, heavyDuration: 39, heavyDamage: 21 },
  raijin: { plan: 'Aguanta el intercambio con tu fuerte; cuidado al fallarlo.', lightReach: 82, heavyReach: 122, heavyStartup: 13, heavyDuration: 38, heavyDamage: 23 },
  odin: { plan: 'Controla con Gungnir y conecta el fuerte desde lejos.', lightReach: 88, heavyReach: 140, heavyStartup: 12, heavyDuration: 36, heavyDamage: 19 },
  thor: { plan: 'Espera el ataque rival y castiga con Mjölnir.', lightReach: 74, heavyReach: 108, heavyStartup: 14, heavyDuration: 39, heavyDamage: 23 },
  kali: { plan: 'Presiona con tajos rápidos y castiga los ataques rivales.', lightReach: 78, heavyReach: 118, heavyStartup: 10, heavyDuration: 33, heavyDamage: 19 },
  loki: { plan: 'Busca la espalda; usa el engaño para cambiar de lado.', lightReach: 70, heavyReach: 100, heavyStartup: 8, heavyDuration: 29, heavyDamage: 16 },
  sunwukong: { plan: 'Enlaza golpes y controla el espacio con el bastón.', lightReach: 82, heavyReach: 126, heavyStartup: 10, heavyDuration: 32, heavyDamage: 18 },
  origen: { plan: 'El creador de los mundos.', lightReach: 110, heavyReach: 150, heavyStartup: 12, heavyDuration: 36, heavyDamage: 23 }
};

export const GUARD_WINDOW = 7;
export const GUARD_RECOVERY = 45;
export const INPUT_BUFFER = 9;
export const profileFor = (id: string) => COMBAT[id] ?? COMBAT.zeus;
