import { ArrowLeft, ArrowRight, Check, Crown, LockKeyhole, Mountain } from 'lucide-react';
import OptionsFrame from './OptionsFrame';
import type { TowerRun } from './game/tower';
import { TOWER_ENDINGS } from './game/tower';

const portrait = (id: string) => `${import.meta.env.BASE_URL}portraits/${id}.webp`;

export default function TowerMenu({ run, fight, back }: { run: TowerRun; fight: () => void; back: () => void }) {
  const rival = run.rivals[run.floor];
  const summit = run.floor === run.rivals.length - 1;
  return <OptionsFrame kind="tower-screen" eyebrow="TORRE DE LOS DIOSES" title="Asciende a la gloria"
    subtitle={`${run.floor} de ${run.rivals.length} combates superados · Un solo camino hacia la cima.`}
    footer={<><button className="options-back" onClick={back}><ArrowLeft size={16} /> Salir <kbd>ESC</kbd></button>
      <span>Tu progreso en esta torre termina al salir</span><button className="arena-confirm" onClick={fight}>A PELEAR <ArrowRight size={17} /></button></>}>
    <div className="tower-layout">
      <section className="tower-encounter" aria-label="Próximo combate">
        <div className="tower-encounter-top"><span>{summit ? 'EL ÚLTIMO DESAFÍO' : `PISO ${String(run.floor + 1).padStart(2, '0')}`}</span><Mountain size={18} /></div>
        <div className="tower-duel"><div className="tower-hero"><img src={portrait(run.hero.id)} alt={run.hero.name} /><span>TU DIOS</span><strong>{run.hero.name}</strong></div>
          <b className="tower-vs">VS</b><div className="tower-rival"><img src={portrait(rival.id)} alt={rival.name} /><span>{summit ? 'LA CIMA' : rival.pantheon}</span><strong>{rival.name}</strong></div></div>
        <div className="tower-encounter-bottom"><span>{summit ? 'El destino de los reinos se decide aquí.' : 'Vence a tu rival para avanzar al siguiente piso.'}</span>
          <div className="tower-reserves"><strong>{run.continues}</strong><span>CONTINUACIONES<br />DISPONIBLES</span></div></div>
      </section>
      <section className="tower-route" aria-label="Ruta de la torre">
        <div className="tower-route-heading"><span>TU ASCENSO</span><span>{String(run.floor + 1).padStart(2, '0')} / {String(run.rivals.length).padStart(2, '0')}</span></div>
        <ol className="tower-floors">{run.rivals.map((deity, index) => {
          const current = index === run.floor, beaten = index < run.floor;
          const secret = index === run.rivals.length - 1 && !current && !beaten;
          return <li key={deity.id} data-current={current} data-beaten={beaten} data-summit={index === run.rivals.length - 1} aria-current={current ? 'step' : undefined}>
            <span className="tower-floor-number">{index === run.rivals.length - 1 ? <Crown size={14} /> : String(index + 1).padStart(2, '0')}</span>
            {secret ? <div className="tower-secret"><LockKeyhole size={19} /></div> : <img src={portrait(deity.id)} alt="" />}
            <div className="tower-floor-name"><strong>{secret ? 'El último desafío' : deity.name}</strong><span>{current ? 'TU SIGUIENTE COMBATE' : beaten ? 'SUPERADO' : secret ? 'ALCANZA LA CIMA' : deity.pantheon}</span></div>
            <span className="tower-floor-state">{beaten ? <Check size={15} /> : current ? <ArrowRight size={15} /> : null}</span>
          </li>;
        })}</ol>
      </section>
    </div>
  </OptionsFrame>;
}

export function TowerEnding({ run, back }: { run: TowerRun; back: () => void }) {
  return <OptionsFrame kind="tower-ending-screen" eyebrow="TORRE DE LOS DIOSES / CONQUISTADA" title="Tu nombre es leyenda"
    subtitle="Nueve combates. Cuatro reinos. Una victoria que cambia el destino."
    footer={<><button className="options-back" onClick={back}><ArrowLeft size={16} /> Volver al menú <kbd>ESC</kbd></button><Crown size={20} /></>}>
    <div className="tower-ending"><div><Crown className="tower-ending-crown" /><img src={portrait(run.hero.id)} alt={run.hero.name} /></div>
      <article><span>EL DESTINO DE {run.hero.pantheon.toUpperCase()}</span><h3>{run.hero.name}</h3><p>{TOWER_ENDINGS[run.hero.id]}</p></article></div>
  </OptionsFrame>;
}

export function TowerResult({ run, won, next, back }: { run: TowerRun; won: boolean; next: () => void; back: () => void }) {
  const top = run.floor + 1 === run.rivals.length;
  const canContinue = won || run.continues > 0;
  return <OptionsFrame kind="tower-result-screen" eyebrow="TORRE DE LOS DIOSES / RESULTADO" title={won ? top ? 'La torre es tuya' : 'Un paso más hacia la cima' : 'Tu ascenso se detiene'}
    subtitle={won ? `Piso ${run.floor + 1} superado` : canContinue ? 'Puedes volver a desafiar a tu rival.' : `Llegaste al piso ${run.floor + 1} de ${run.rivals.length}.`}
    footer={<><button className="options-back" onClick={back}><ArrowLeft size={16} /> Salir <kbd>ESC</kbd></button>
      <button className="arena-confirm" onClick={next}>{won ? top ? 'VER TU FINAL' : 'SUBIR DE PISO' : canContinue ? 'CONTINUAR' : 'VOLVER AL MENÚ'}<ArrowRight size={17} /></button></>}>
    <div className="tower-result"><img src={portrait(won ? run.hero.id : run.rivals[run.floor].id)} alt="" />
      <div><span>{won ? 'VICTORIA' : 'DERROTA'}</span><h3>{won ? run.hero.name : run.rivals[run.floor].name}</h3>
        <p>{won ? top ? 'Has conquistado la Torre de los Dioses. Descubre el final de tu historia.' : `Siguiente rival: ${run.rivals[run.floor + 1].name}` : `${run.continues} continuaciones disponibles`}</p></div></div>
  </OptionsFrame>;
}
