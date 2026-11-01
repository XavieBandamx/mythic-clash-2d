import { ArrowLeft, ArrowRight, Shuffle } from 'lucide-react';
import OptionsFrame from './OptionsFrame';
import { ARENAS } from './game/arenas';
import { getControls, keyLabel } from './game/controls';

const DESCRIPTIONS = [
  'Bajo la mirada del Olimpo, cada golpe retumba en el coliseo.',
  'Entre columnas y arena, los dioses se enfrentan al juicio de Osiris.',
  'La piedra ancestral de Tenochtitlan espera a sus nuevos campeones.',
  'Pétalos y relámpagos acompañan el duelo en el reino de la tormenta.',
  'Más allá de los reinos, la torre reúne a quienes desafían a los dioses.',
  'La nieve y el trueno custodian el puente de Asgard.',
  'Las puertas del Abismo arden bajo un cielo de ceniza.',
  'La luna ilumina un duelo entre ruinas y aguas serenas.',
  'Un jardín suspendido entre nubes espera a sus campeones.',
  'El eclipse anuncia el combate entre templos ancestrales.'
];

export default function ArenaSelect({ selected, highlight, choose, back, fighters }: {
  selected: number; highlight: (index: number) => void; choose: (index: number) => void; back: () => void; fighters: [string, string];
}) {
  const arena = selected > 0 ? ARENAS[selected - 1] : null;
  const controls = getControls().keyboard[0];
  return <OptionsFrame title="Elige tu arena" eyebrow="EL CAMPO DE BATALLA" kind="arena-screen"
    subtitle={<span className="arena-matchup">{fighters[0]} <b>VS</b> {fighters[1]}</span>}
    footer={<><button className="options-back" onClick={back}><ArrowLeft size={16} /> Volver <kbd>ESC</kbd></button>
      <span><kbd>{keyLabel(controls.left)} / {keyLabel(controls.right)}</kbd> elegir</span>
      <button className="arena-confirm" onClick={() => choose(selected)}>A PELEAR <ArrowRight size={17} /></button></>}>
    <div className="arena-layout">
      <div className="arena-preview" aria-live="polite">
        {arena ? <img key={arena.src} className="arena-preview-image" src={arena.src} alt={arena.name} /> :
          <div className="arena-random-mosaic" aria-hidden="true">{ARENAS.slice(0, 4).map(item => <img key={item.src} src={item.src} alt="" />)}<Shuffle /></div>}
        <div className="arena-preview-caption"><span>{arena?.pantheon ?? (arena ? 'MÁS ALLÁ DE LOS REINOS' : 'QUE DECIDA EL DESTINO')}</span>
          <h3>{arena?.name ?? 'Arena aleatoria'}</h3>
          <p>{arena ? DESCRIPTIONS[selected - 1] : `Cualquiera de las ${ARENAS.length} arenas. El escenario se revela al comenzar el combate.`}</p>
        </div>
        <div className="arena-preview-index" aria-hidden="true">{selected ? String(selected).padStart(2, '0') : '?'}</div>
      </div>
      <nav className="arena-roster" aria-label="Arenas disponibles">
        {[null, ...ARENAS].map((item, index) => <button key={item?.src ?? 'random'} className="arena-tile"
          data-active={selected === index} aria-pressed={selected === index} aria-label={item?.name ?? 'Arena aleatoria'}
          onMouseEnter={() => highlight(index)} onFocus={() => highlight(index)} onClick={() => highlight(index)}>
          {item ? <img src={item.src} alt="" /> : <span className="arena-random-icon"><Shuffle size={24} /></span>}
          <span className="arena-tile-copy"><small>{item?.pantheon ?? (item ? 'NEUTRAL' : 'SORPRÉNDEME')}</small><strong>{item?.name ?? 'Aleatoria'}</strong></span>
          <span className="arena-tile-index">{index ? String(index).padStart(2, '0') : '?'}</span>
        </button>)}
      </nav>
    </div>
  </OptionsFrame>;
}
