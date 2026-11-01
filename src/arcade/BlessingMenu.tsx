import { ArrowRight, Check, Shield, Sparkles, Swords } from 'lucide-react';
import OptionsFrame from '../OptionsFrame';
import { getControls, keyLabel } from '../game/controls';

const BLESSINGS = [
  { title: 'Fuerza', tag: 'GOLPEA MÁS FUERTE', Icon: Swords, amount: '+12%', stat: 'DAÑO DE ATAQUE', description: 'Potencia cada golpe y abre camino entre tus enemigos.' },
  { title: 'Refugio', tag: 'RESISTE EL SIGUIENTE REINO', Icon: Shield, amount: '+35', stat: 'VIDA AL RECIBIRLA', description: 'Recupera vida y recibe un 12% menos de daño.' },
  { title: 'Sabiduría', tag: 'DESATA TU MAGIA', Icon: Sparkles, amount: '+2', stat: 'VASIJAS DE MAGIA', description: 'Recibe vasijas y aumenta un 15% el poder de tu magia.' }
] as const;

export interface BlessingPlayer { name: string; choice: number | null; cursor: number; available: boolean; controllable?: boolean; local?: boolean }

export default function BlessingMenu({ choice, cursor, choose, coop, players }: {
  choice: number | null; cursor: number; choose: (index: number, player?: number) => void; coop: boolean; players?: BlessingPlayer[];
}) {
  if (coop && players) return <CoopBlessings players={players} choose={choose} />;
  return <OptionsFrame kind="blessing-screen" eyebrow="REINO COMPLETADO" title="Recibe el poder divino"
    subtitle="Elige una bendición para el siguiente reino. Su efecto dura hasta elegir otra."
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

function CoopBlessings({ players, choose }: { players: BlessingPlayer[]; choose: (index: number, player: number) => void }) {
  const ready = players.filter(player => player.available).every(player => player.choice !== null);
  return <OptionsFrame kind="coop-blessing-screen" eyebrow="REINO COMPLETADO / COOPERATIVO" title="Dos dioses. Dos bendiciones."
    subtitle="Cada jugador elige su propio poder. Avanzan cuando ambos estén listos."
    footer={<div className="blessing-status" role="status">{ready ? 'Bendiciones recibidas. Preparando el siguiente reino…' : 'Elijan con sus controles o toquen una tarjeta. El efecto dura hasta elegir otra bendición.'}</div>}>
    <div className="coop-blessing-players">{players.map((player, index) => {
      const keys = getControls().keyboard[player.local ? 0 : index];
      return <section className="coop-blessing-player" key={index} aria-label={`Bendición del jugador ${index + 1}`}>
        <header><span>JUGADOR {index + 1}{player.local ? ' / TÚ' : ''}</span><h3>{player.name}</h3><b>{!player.available ? 'FUERA DE COMBATE' : player.choice === null ? player.controllable === false ? 'COMPAÑERO ELIGIENDO' : 'ELIGE TU PODER' : 'LISTO ✓'}</b></header>
        <div className="coop-blessing-options">{BLESSINGS.map(({ title, Icon, amount, stat, description }, option) => <button key={title}
          data-active={(player.choice ?? player.cursor) === option} disabled={!player.available || player.choice !== null || player.controllable === false}
          aria-pressed={player.choice === option} onClick={() => choose(option, index)} aria-label={`Jugador ${index + 1}: ${title}`}>
          <Icon size={27} strokeWidth={1.3} /><div><strong>{title}</strong><span>{description}</span></div>
          <b>{amount}<small>{stat}</small></b>{player.choice === option && <Check className="coop-blessing-check" size={14} />}
        </button>)}</div>
        <p>{player.available ? player.controllable === false ? 'Eligiendo desde su dispositivo' : `${keyLabel(keys.left)} / ${keyLabel(keys.right)} elegir · ${keyLabel(keys.light)} confirmar` : 'Podrás continuar en el siguiente combate por la mitad de tus puntos.'}</p>
      </section>;
    })}</div>
  </OptionsFrame>;
}
