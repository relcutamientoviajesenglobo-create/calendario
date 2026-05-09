function HeroTomorrow({ onJump, onShowGaps }) {
  const tmr = WEFLY.TOMORROW;
  const tmrEvents = WEFLY.eventsByDate(tmr);
  const pax = tmrEvents.reduce((s, e) => s + e.pax, 0);
  const flights = tmrEvents.length;
  const gapCount = WEFLY.gapsTomorrow.length;
  const lbl = WEFLY.dateLabel(tmr);
  const ops = WEFLY.operatorBreakdown(tmrEvents);

  return (
    <div className="brief-main">
      <div className="brief-eyebrow">
        <span className="sun"></span>
        <span>Briefing · Mañana</span>
      </div>

      <div className="brief-headline">
        <div className="brief-date">
          <div className="day">{lbl.dom} {lbl.mon}</div>
          <div className="meta">{lbl.dow.charAt(0).toUpperCase() + lbl.dow.slice(1)} · pickup desde 06:00</div>
        </div>
        <button className="brief-cta" onClick={onJump}>
          Ver agenda completa <Icon name="arrow-r" size={14}/>
        </button>
      </div>

      <div className="brief-stats">
        <div className="brief-stat">
          <div className="label">Pasajeros</div>
          <div className="value">{pax}</div>
          <div className="sub">en {flights} vuelo{flights !== 1 && 's'}</div>
        </div>
        <div className="brief-stat">
          <div className="label">Operadores activos</div>
          <div className="value">{ops.length}</div>
          <div className="sub">{ops.slice(0, 2).map(o => o.label).join(' · ') || '—'}</div>
        </div>
        <div className={clsx('brief-stat', gapCount > 0 && 'alert')} onClick={gapCount > 0 ? onShowGaps : null}>
          <div className="label">Sin agendar</div>
          <div className="value">{gapCount}</div>
          {gapCount > 0
            ? <div className="sub"><Icon name="warn" size={12}/> Confirmadas en correo · ver lista →</div>
            : <div className="sub">Todo cuadrado ✓</div>}
        </div>
      </div>

      <div className="op-rail">
        {ops.map(o => (
          <span className="op-pill" key={o.calendar}>
            <span className="dot" style={{ background: o.color }}></span>
            {o.label} <b>{o.pax}</b>
          </span>
        ))}
        {!ops.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Sin actividad registrada para mañana</span>}
      </div>
    </div>
  );
}

Object.assign(window, { HeroTomorrow });
