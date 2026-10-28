// ==========================================================================
// ESTILOS DE PELEA: lo que hace a cada dios distinto en versus y arcade
// ==========================================================================

export type FightStyle = 'Poder' | 'Velocidad' | 'Guardián' | 'Alcance';

export interface Passive {
  name: string;
  desc: string;
}

export const STYLE_INFO: Record<FightStyle, { color: string; summary: string }> = {
  Poder: { color: '#f97316', summary: 'Pega durísimo y su golpe fuerte rompe la guardia, pero es lento.' },
  Velocidad: { color: '#22d3ee', summary: 'Se mueve y ataca más rápido que nadie; encadena golpes sin respiro.' },
  'Guardián': { color: '#4ade80', summary: 'Aguanta muchísimo, bloquea sin perder vida y casi no lo empujan.' },
  Alcance: { color: '#60a5fa', summary: 'Golpes largos que controlan la distancia y mantienen lejos al rival.' }
};

// Las estadísticas (2-5) ahora pesan de verdad: de ×0.84 a ×1.2 de daño y de ×1.1 a ×0.8 de daño recibido
export const statDamageMul = (attack: number) => 0.6 + attack * 0.12;
export const statDefenseMul = (defense: number) => 1.3 - defense * 0.1;

// Ajustes por estilo compartidos por los dos modos
export const STYLE_ATTACK_SPEED: Record<FightStyle, number> = { Poder: 1, Velocidad: 0.75, 'Guardián': 1, Alcance: 1 }; // × duración de los ataques
export const STYLE_REACH: Record<FightStyle, number> = { Poder: 1, Velocidad: 1, 'Guardián': 1, Alcance: 1.35 };      // × alcance de los golpes
export const STYLE_KNOCKBACK_TAKEN: Record<FightStyle, number> = { Poder: 1, Velocidad: 1, 'Guardián': 0.6, Alcance: 1 };

// Pasivas: números comunes a versus y arcade
export const PASSIVE = {
  lifesteal: 0.25,        // Hades: vida recuperada por daño hecho
  burnTicks: 180,         // Ra: duración de la quemadura (3 s)
  burnEvery: 30,          // Ra: un tic de quemadura cada medio segundo
  burnDamage: 1.5,
  furyBelow: 0.35,        // Huitzilopochtli: por debajo de este % de vida...
  furyMul: 1.5,           // ...pega un 50% más
  evadeChance: 0.2,       // Anubis
  reviveHp: 0.35,         // Osiris
  reflect: 0.5,           // Mictlantecuhtli: parte del daño bloqueado (versus) o recibido (arcade, ×0.6) que regresa
  zeusBonus: 0.5,         // Zeus: daño extra del rayo de su remate
  meterMul: 1.5,          // Amaterasu: carga de súper / magia
  poseidonPush: 1.8       // Poseidón: empuje de sus golpes fuertes
};
