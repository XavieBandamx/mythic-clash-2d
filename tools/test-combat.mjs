import { build } from 'esbuild';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

// Ejecuta las clases reales del juego, sin navegador ni dependencias de pruebas.
const directory = await mkdtemp(join(tmpdir(), 'mythic-combat-'));
try {
  const output = join(directory, 'regression.mjs');
  await build({
    entryPoints: ['tools/combat-regression.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    plugins: [{
      name: 'urls-de-sprites-en-node',
      setup(build) {
        // Equivalente al glob de Vite, sin copiar imágenes al ejecutable temporal de pruebas.
        build.onLoad({ filter: /[\\/]spriteAssets\.ts$/ }, async () => {
          const files = (await readdir('assets/sprites')).filter(name => name.endsWith('.webp') && !name.endsWith('-original.webp'));
          const urls = Object.fromEntries(files.map(name => [`../../assets/sprites/${name}`, `/assets/sprites/${name}`]));
          return { contents: `export const SPRITE_ASSETS = ${JSON.stringify(urls)};`, loader: 'ts' };
        });
      }
    }]
  });
  await import(pathToFileURL(output).href);
} finally {
  if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('mythic-combat-')) {
    throw new Error('Directorio temporal fuera del destino esperado');
  }
  await rm(directory, { recursive: true, force: true });
}
