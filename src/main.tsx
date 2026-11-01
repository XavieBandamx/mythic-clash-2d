import { createRoot } from 'react-dom/client';
import { DEITIES } from './game/deities';
import { getSpriteSheetConfig, spriteAssetSrc } from './game/sprites';
import './index.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';

const screen = document.getElementById('boot-screen')!;
const status = document.getElementById('boot-status')!;
const fill = document.getElementById('boot-fill')!;
const percent = document.getElementById('boot-percent')!;
const retry = document.getElementById('boot-retry')!;
function loadImage(src: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.src = ''; reject(new Error('La carga tardó demasiado.')); }, 20000);
    image.onload = () => { clearTimeout(timer); resolve(); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('No se pudo cargar un recurso.')); };
    image.src = src;
  });
}
async function boot() {
  retry.hidden = true;
  const base = import.meta.env.BASE_URL;
  const ids = ['amaterasu','odin','quetzalcoatl','raijin','sunwukong','zeus','ra'];
  const tasks: { label: string; run: () => Promise<unknown> }[] = [
    { label: 'Preparando la interfaz…', run: () => import('./App.tsx') },
    { label: 'Cargando fuentes…', run: async () => { await Promise.all([document.fonts.load('700 18px Cinzel'), document.fonts.load('400 14px "Plus Jakarta Sans"')]); await document.fonts.ready; } },
    ...['boot-logo.webp','boot-background.webp','arenas/grecia.webp',...DEITIES.map(deity => `portraits/${deity.id}.webp`)].map(src => ({ label: 'Cargando la portada y los retratos…', run: () => loadImage(base + src) })),
    ...ids.map(id => ({ label: 'Preparando personajes…', run: () => loadImage(getSpriteSheetConfig(DEITIES.find(deity => deity.id === id)!).src) })),
    ...['minotauro','draugr','escorpion','oni-gigante','guerrero-aguila'].map(id => ({ label: 'Preparando personajes…', run: () => loadImage(spriteAssetSrc(id)) })),
  ];
  let completed = 0;
  const update = () => { const value = Math.floor(completed / tasks.length * 100); fill.style.width = `${value}%`; percent.textContent = `${value}%`; screen.setAttribute('aria-valuenow', String(value)); };
  update();
  try {
    // Los lotes limitan las descargas simultáneas y el progreso cuenta recursos terminados.
    for (let i = 0; i < tasks.length; i += 4) {
      status.textContent = tasks[i].label;
      await Promise.allSettled(tasks.slice(i, i + 4).map(async task => { await task.run(); completed++; update(); })).then(results => {
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      });
    }
    const { default: App } = await import('./App.tsx');
    status.textContent = '¡Que comience el torneo!';
    createRoot(document.getElementById('root')!).render(<App />);
    requestAnimationFrame(() => requestAnimationFrame(() => { screen.classList.add('boot-leaving'); setTimeout(() => screen.remove(), 400); }));
  } catch {
    status.textContent = 'No pudimos preparar el torneo. Revisa la conexión o vuelve a intentarlo.';
    retry.hidden = false;
  }
}
retry.addEventListener('click', () => location.reload());
void boot();
