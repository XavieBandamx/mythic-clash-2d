import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, Wifi, ArrowRight } from 'lucide-react';
import OptionsFrame from '../OptionsFrame';
import { DEITIES } from '../game/deities';
import type { Difficulty } from '../game/core';
import { LanSession } from './session';
import type { LanStart } from './protocol';

export default function LanLobby({ back, start, createSession = role => new LanSession(role) }: { back: () => void; start: (session: LanSession, config: LanStart) => void; createSession?: (role: 'host' | 'guest') => LanSession }) {
  const [room, setRoom] = useState<LanSession | null>(null);
  const [, refresh] = useState(0);
  const [deity, setDeity] = useState(DEITIES[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
  const [ready, setReady] = useState(false);
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'room' | 'team'>('room');
  const [address, setAddress] = useState(0);
  const [qr, setQr] = useState('');
  const code = room?.invitations[address];
  useEffect(() => {
    let current = true;
    if (code) void import('qrcode').then(module => module.default.toDataURL(code, { width: 256, margin: 2, errorCorrectionLevel: 'M' })).then(data => { if (current) setQr(data); }).catch(() => { if (current) setError('No se pudo generar el QR. Usa la invitación escrita.'); });
    return () => { current = false; };
  }, [code]);
  const handed = useRef(false), active = useRef<LanSession | null>(null);
  useEffect(() => () => { if (!handed.current) void active.current?.close(); }, []);
  useEffect(() => {
    if (!room) return;
    return room.subscribe(() => {
      refresh(value => value + 1);
      if (room.config && !handed.current) { handed.current = true; start(room, room.config); }
    });
  }, [room, start]);
  useEffect(() => { if (room?.connected) void room.select(deity, ready); }, [room, deity, ready, room?.connected]);
  const connect = async (role: 'host' | 'guest') => {
    setBusy(true); setError('');
    const session = createSession(role); active.current = session; setRoom(session);
    try { if (role === 'host') await session.host(); else { await session.join(invite); setView('team'); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo conectar'); setRoom(null); await session.close(); }
    finally { setBusy(false); }
  };
  const remote = DEITIES.find(item => item.id === room?.remoteDeity);
  return <OptionsFrame kind="lan-screen" eyebrow="COOPERATIVO / WI-FI LOCAL" title="Cooperativo Wi-Fi"
    subtitle="Mismo Wi-Fi o punto de acceso. No necesitan internet."
    footer={<><button className="options-back" onClick={back}><ArrowLeft size={16} /> Volver</button><span>Mantengan ambos juegos abiertos y conectados a la misma red</span></>}>
    {room && <div className="control-tabs lan-tabs"><button className="control-tab" aria-pressed={view === 'room'} onClick={() => setView('room')}>Sala e invitación</button><button className="control-tab" aria-pressed={view === 'team'} onClick={() => setView('team')}>Mi equipo {room.connected ? '●' : ''}</button></div>}
    <div className={`lan-layout ${room ? '' : 'lan-layout-entry'}`}>
      <section className="lan-card" data-visible={view === 'room'}><Wifi size={38} strokeWidth={1.2} /><h3>{room ? room.role === 'host' ? 'Tu sala privada' : 'Conectado a la sala' : 'Reúnan a sus dioses'}</h3>
        {!room && <><p>Un celular crea la partida. El compañero pega su invitación y controla a su propio dios.</p>
          <button className="arena-confirm" disabled={busy} onClick={() => void connect('host')}>Crear sala <ArrowRight size={16} /></button>
          <label>Invitación del anfitrión<input value={invite} onChange={event => setInvite(event.target.value)} placeholder="192.168…:puerto#invitación" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
          <button className="options-reset" disabled={busy || !invite.trim()} onClick={() => void connect('guest')}>Unirme a la sala</button></>}
        {!room && <button className="options-reset" disabled={busy} onClick={() => void LanSession.scanInvite().then(value => { if (value) setInvite(value); }).catch(() => setError('No se pudo leer el QR. Puedes pegar la invitación.'))}>Escanear QR del anfitrión</button>}
        {room?.role === 'host' && code && <div className="lan-invite">{qr && <img className="lan-qr" src={qr} alt="QR de la sala privada" />}{room.invitations.length > 1 && <select aria-label="Dirección de la sala" value={address} onChange={event => setAddress(Number(event.target.value))}>{room.invitations.map((value, index) => <option key={value} value={index}>{value.split('#')[0]}</option>)}</select>}<code>{code}</code><button aria-label="Copiar invitación" onClick={() => void room.copyInvite(code).then(() => setCopied(true))}><Copy size={16} />{copied ? 'Copiada' : 'Copiar'}</button></div>}
        {room && <p role="status">{busy ? 'Preparando conexión…' : room.error || (room.connected ? 'Compañero conectado' : 'Esperando al compañero…')}</p>}
        {room?.role === 'host' && <p>Comparte la invitación o escríbela en el otro celular. Si aparecen varias direcciones, usa la de la red que comparten.</p>}
        {error && <p className="lan-error" role="alert">{error}</p>}
      </section>
      {room && <section className="lan-card lan-team-card" data-role={room.role} data-visible={view === 'team'}><span className="title-eyebrow">TU EQUIPO</span><label>Tu dios<select value={deity} disabled={ready || busy} onChange={event => setDeity(event.target.value)}>{DEITIES.map(item => <option key={item.id} value={item.id}>{item.name} / {item.pantheon}</option>)}</select></label>
        {(!room || room.role === 'host') && <label>Dificultad<select value={difficulty} disabled={ready} onChange={event => setDifficulty(event.target.value as Difficulty)}><option value="FACIL">Fácil</option><option value="NORMAL">Normal</option><option value="DIFICIL">Difícil</option></select></label>}
        <div className="lan-partner"><span>COMPAÑERO</span><strong>{remote?.name ?? 'Todavía no ha elegido'}</strong><small>{room?.remoteReady ? 'LISTO ✓' : 'ESPERANDO'}</small></div>
        <button className="options-reset" disabled={!room?.connected || !!room.error} onClick={() => setReady(value => !value)}>{ready ? 'Listo ✓ · Cambiar elección' : 'Estoy listo'}</button>
        {room?.role === 'host' && <button className="arena-confirm" disabled={!ready || !room.remoteReady || !room.connected || !!room.error} onClick={() => void room.start({ deities: [deity, room.remoteDeity!], difficulty })}>Comenzar partida <ArrowRight size={16} /></button>}
        {room?.role === 'guest' && ready && <p role="status">El anfitrión iniciará cuando ambos estén listos.</p>}
        <p>El anfitrión debe mantener el juego abierto. Si la conexión se pierde, se detiene la partida y tendrán que crear una sala nueva.</p>
      </section>}
    </div>
  </OptionsFrame>;
}
