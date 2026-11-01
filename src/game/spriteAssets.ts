// Solo las hojas usadas por el juego se versionan aquí; las fuentes de edición se conservan fuera del repositorio.
export const SPRITE_ASSETS = import.meta.glob<string>([
  '../../assets/sprites/*.webp',
  '!../../assets/sprites/*-original.webp'
], { eager: true, query: '?url', import: 'default' });
