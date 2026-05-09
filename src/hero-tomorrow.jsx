/* HeroTomorrow — briefing principal con toggle Hoy/Mañana
 * Default basado en hora local: <11AM muestra HOY, ≥11AM muestra MAÑANA.
 * Usuario puede toggle entre los dos sin recargar (data ya en WEFLY).
 */
function HeroTomorrow({ onJump, onShowGaps, date, mode, onToggleMode }) {
  const targetDate = date || WEFLY.TOMORROW;
  const isToday = targetDate === WEFLY.TODAY;
  const dayEvents = WEFLY.eventsByDate(targetDate);
  const pax = dayEvents.reduce((s, e) => s + e.pax, 0);
  const flights = dayEvents.length;
  // Gaps del día seleccionado (no siempre TOMORROW)
  const gapsForDay = WEFLY.gaps.filter(g => g.fecha === targetDate);
  const gapCount = gapsForDay.length;
  const lbl = WEFLY.dateLabel(targetDate);
  const ops = WEFLY.operatorBreakdown(dayEvents);
  const eyebrowText = isToday ? 'Briefing · Hoy' : 'Briefing · Mañana';
  const emptyText = isToday ? 'Sin actividad registrada para hoy' : 'Sin actividad registrada para mañana';

  return (
    <div className="brief-main">
      <div className="brief-eyebrow">
        <span className="sun"></span>
        <span>{eyebrowText}</span>
        {/* Toggle HOY ↔ MAÑANA */}
        <div className="brief-toggle" role="tablist" aria-label="Día del briefing">
          <button
            role="tab"
            aria-selected={isToday}
            className={clsx('brief-toggle-btn', isToday && 'active')}
            onClick={() => onToggleMode && onToggleMode('today')}>
            Hoy
          </button>
          <button
            role="tab"
            aria-selected={!isToday}
            className={clsx('brief-toggle-btn', !isToday && 'active')}
            onClick={() => onToggleMode && onToggleMode('tomorrow')}>
            Mañana
          </button>
        </div>
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
        {!ops.length && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{emptyText}</span>}
      </div>
    </div>
  );
}

Object.assign(window, { HeroTomorrow });
