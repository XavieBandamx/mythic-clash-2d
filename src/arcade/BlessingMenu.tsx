import { ArrowRight, Check, Shield, Sparkles, Swords } from 'lucide-react';
import OptionsFrame from '../OptionsFrame';

const BLESSINGS = [
  { title: 'Fuerza', tag: 'GOLPEA MÁS FUERTE', Icon: Swords, amount: '+12%', stat: 'DAÑO DE ATAQUE', description: 'Potencia cada golpe y abre camino entre tus enemigos.' },
  { title: 'Refugio', tag: 'RESISTE EL SIGUIENTE REINO', Icon: Shield, amount: '+35', stat: 'VIDA AL RECIBIRLA', description: 'Recupera vida y recibe un 12% menos de daño.' },
  { title: 'Sabiduría', tag: 'DESATA TU MAGIA', Icon: Sparkles, amount: '+2', stat: 'VASIJAS DE MAGIA', description: 'Recibe vasijas y aumenta un 15% el poder de tu magia.' }
] as const;

export default function BlessingMenu({ choice, cursor, choose, coop }: {
  choice: number | null; cursor: number; choose: (index: number) => void; coop: boolean;
}) {
  return <OptionsFrame kind="blessing-screen" eyebrow="REINO COMPLETADO" title="Recibe el poder divino"
    subtitle={coop ? 'Elige una bendición para ambos dioses. Su efecto dura hasta elegir otra.' : 'Elige una bendición para el siguiente reino. Su efecto dura hasta elegir otra.'}
    footer={<><span className="blessing-hint">← / → + Ataque · Atajos: 1 / 2 / 3</span><div className="blessing-status" role="status">{choice === null ? 'Toca una tarjeta para recibir su poder' : 'Bendición recibida. Preparando el siguiente reino…'}</div></>}>
    <div className="blessing-grid">{BLESSINGS.map(({ title, tag, Icon, amount, stat, description }, index) => <button key={title}
      className="blessing-card" data-active={(choice ?? cursor) === index} aria-pressed={choice === index} disabled={choice !== null} onClick={() => choose(index)}>
      <div className="blessing-top"><span>0{index + 1} / BENDICIÓN</span>{choice === index && <Check size={16} />}</div>
      <div className="blessing-sigil"><Icon size={54} strokeWidth={1.25} /></div>
      <div className="blessing-copy"><span className="blessing-tag">{tag}</span><h3>{title}</h3>
        <div className="blessing-stat"><strong>{amount}</strong><span>{stat}</span></div><p>{description}</p></div>
      <div className="blessing-pick">{choice === index ? 'PODER RECIBIDO' : 'RECIBIR BENDICIÓN'}<ArrowRight size={16} /></div>
    </button>)}</div>
  </OptionsFrame>;
}
