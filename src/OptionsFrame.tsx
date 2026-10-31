import type { ReactNode } from 'react';
import { ARENAS } from './game/arenas';

export default function OptionsFrame({ title, subtitle, children, footer, kind = '', eyebrow = 'A TU MANERA' }: {
  title: string; subtitle: ReactNode; children: ReactNode; footer: ReactNode; kind?: string; eyebrow?: string;
}) {
  return <section className={`options-screen ${kind}`} aria-label={title}>
    <img className="options-backdrop" src={ARENAS[0].src} alt="" />
    <div className="options-shell">
      <header className="options-heading">
        <span className="title-eyebrow"><i /> MYTHIC CLASH / {eyebrow}</span>
        <h2>{title}</h2>
        <div className="options-subtitle" aria-live="polite">{subtitle}</div>
      </header>
      <div className="options-body">{children}</div>
      <footer className="options-footer">{footer}</footer>
    </div>
  </section>;
}
