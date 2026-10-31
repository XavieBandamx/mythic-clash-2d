import { ArrowLeft, Check, ChevronRight, Flame, Shield, Swords } from 'lucide-react';
import OptionsFrame from './OptionsFrame';

const LEVELS = [
  { id: 'FACIL', title: 'Fácil', tag: 'ENCUENTRA TU RITMO', Icon: Shield, description: 'Aprende tus movimientos y disfruta el combate con espacio para reaccionar.', facts: ['Reacción pausada', 'Daño enemigo −30%', 'Ideal para practicar'] },
  { id: 'NORMAL', title: 'Normal', tag: 'ACEPTA EL RETO', Icon: Swords, description: 'Un rival equilibrado que combina ataques, controla distancias y se defiende.', facts: ['Reacción equilibrada', 'Daño estándar', 'Bloqueo del 45%'] },
  { id: 'DIFICIL', title: 'Difícil', tag: 'DEMUESTRA TU PODER', Icon: Flame, description: 'La IA castiga tus errores y encadena combos. Cada apertura cuenta.', facts: ['Reacción implacable', 'Daño enemigo +30%', 'Bloqueo del 85%'] }
] as const;
type Difficulty = typeof LEVELS[number]['id'];

export default function DifficultyMenu({ current, selected, highlight, choose, back }: {
  current: Difficulty; selected: number; highlight: (index: number) => void; choose: (value: Difficulty) => void; back: () => void;
}) {
  return <OptionsFrame kind="difficulty-screen" title="Elige tu desafío" subtitle="Ajusta la dificultad de tus rivales. Tu siguiente partida, a tu ritmo."
    footer={<><button className="options-back" onClick={back}><ArrowLeft size={16} /> Volver <kbd>ESC</kbd></button><span>Selecciona un nivel para aplicarlo <ChevronRight size={14} /></span></>}>
    <div className="difficulty-grid">
      {LEVELS.map(({ id, title, tag, Icon, description, facts }, index) => <button key={id}
        className="difficulty-card" data-active={selected === index} aria-pressed={current === id}
        onMouseEnter={() => highlight(index)} onFocus={() => highlight(index)} onClick={() => choose(id)}>
        <div className="difficulty-card-top"><span>0{index + 1} / NIVEL</span>{current === id && <b><Check size={12} /> ACTUAL</b>}</div>
        <Icon className="difficulty-emblem" strokeWidth={1} />
        <span className="difficulty-tag">{tag}</span><h3>{title}</h3><p>{description}</p>
        <ul>{facts.map(fact => <li key={fact}>{fact}</li>)}</ul>
        <div className="difficulty-select">ELEGIR NIVEL <ChevronRight size={16} /></div>
      </button>)}
    </div>
  </OptionsFrame>;
}
