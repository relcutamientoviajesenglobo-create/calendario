/* Pending view — Calendar vs Mail
 * Two-column layout: events already on calendar (left)
 * vs incoming reservations from email/Turitop that haven't
 * been added to the calendar yet (right). The right column
 * splits into "unread" (locked, minimal data) and "read"
 * (already opened, full data) groups.
 */
function FlagDots({ flags }) {
  return (
    <span className="flags">
      {flags.paid  && <span className="flag ok"   title="Pagado"><Icon name="check" size={11}/></span>}
      {flags.noted && <span className="flag note" title="Pickup noted"><Icon name="note" size={11}/></span>}
      {flags.hotel && <span className="flag hot"  title="Pickup en hotel"><Icon name="hotel" size={11}/></span>}
      {flags.privado && <span className="flag warn" title="Vuelo privado">P</span>}
    </span>
  );
}

function EventRow({ e, onSelect }) {
  return (
    <div className="rsv" onClick={() => onSelect && onSelect(e)}>
      <div className={clsx('time', !e.timeKnown && 'empty')}>{e.timeKnown ? fmtTime(e.time) : '—'}</div>
      <div>
        <div className="name">
          <span className="pax">{e.pax}P</span>
          <span className="nm-text">{e.name}</span>
        </div>
        <div className="meta">
          <OpTag cal={e.calendar} />
          {e.flags.hotel && <span>· hotel</span>}
        </div>
      </div>
      <FlagDots flags={e.flags} />
    </div>
  );
}

function MailRow({ m, locked, onSelect }) {
  return (
    <div className="mailrow" onClick={() => onSelect && onSelect(m.booking)}>
      <div className="src-pill">{m.source.slice(0, 7)}</div>
      <div>
        <div className="subj">
          {locked
            ? <><Icon name="lock" size={12}/> Reserva pendiente · <b>{m.booking.pax}P</b></>
            : m.booking.nombre}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 }}>
          {locked
            ? <>Por abrir · {m.source}</>
            : <>{m.booking.producto} · {m.booking.email}</>}
        </div>
      </div>
      <div className="when">{m.when} {m.time}</div>
    </div>
  );
}

function PendingView({ search, onSelectEvent, onSelectGap }) {
  const today = WEFLY.TODAY;
  // Calendar column: upcoming events from today onward
  const upcoming = WEFLY.events.filter(e => e.date >= today);
  const filtered = !search ? upcoming
    : upcoming.filter(e => (e.name + ' ' + WEFLY.opLabel(e.calendar)).toLowerCase().includes(search.toLowerCase()));
  const totalPax = filtered.reduce((s, e) => s + e.pax, 0);

  // Group calendar events by date
  const byDate = useMemo(() => {
    const m = new Map();
    filtered.forEach(e => {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date).push(e);
    });
    return [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  }, [filtered]);

  // Mail column: gaps grouped (using emailQueue)
  const unread = WEFLY.emailQueue.unread;
  const read = WEFLY.emailQueue.read;
  const totalMail = unread.length + read.length;

  return (
    <div className="pending-grid">
      {/* LEFT: Calendar */}
      <div className="pcol cal">
        <div className="head">
          <div className="ttl">
            <div className="icon"><Icon name="check" size={16}/></div>
            <div>
              <h2>En Calendario</h2>
              <div className="sub">Pasajeros registrados, listos para logística</div>
            </div>
          </div>
          <div className="stat">
            <div className="big">{totalPax}</div>
            <div className="lbl">pasajeros</div>
          </div>
        </div>
        <div className="body">
          <div className="subhead">
            <span>Próximos vuelos</span>
            <span className="count">{filtered.length}</span>
          </div>
          {byDate.length === 0 && (
            <div className="empty">
              <div className="e-icon"><Icon name="calendar" size={18}/></div>
              No hay vuelos próximos en el rango
            </div>
          )}
          {byDate.map(([date, evs]) => {
            const lbl = WEFLY.dateLabel(date);
            const dpax = evs.reduce((s, e) => s + e.pax, 0);
            return (
              <div className="daygroup" key={date}>
                <div className="day-head">
                  <span>{WEFLY.relativeLabel(date)}</span>
                  <span className="small">· {lbl.dom} {lbl.mon}</span>
                  <span className="pax-sum">{dpax}P · {evs.length}V</span>
                </div>
                {evs.map(e => <EventRow key={e.id} e={e} onSelect={onSelectEvent}/>)}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Mail */}
      <div className="pcol mail">
        <div className="head">
          <div className="ttl">
            <div className="icon"><Icon name="mail" size={16}/></div>
            <div>
              <h2>En Correo · No en Calendario</h2>
              <div className="sub">Reservas pendientes de registrar en Calendar</div>
            </div>
          </div>
          <div className="stat">
            <div className="big">{totalMail}</div>
            <div className="lbl">reservas</div>
          </div>
        </div>
        <div className="body">
          <div className="subhead">
            <span><Icon name="lock" size={11}/> NO abiertos · data mínima</span>
            <span className="count">{unread.length}</span>
          </div>
          {unread.length === 0 && <div className="empty">Sin correos cerrados</div>}
          {unread.map(m => <MailRow key={m.id} m={m} locked={true} onSelect={onSelectGap}/>)}

          <div className="subhead" style={{ marginTop: 14 }}>
            <span><Icon name="open" size={11}/> Ya abiertos · data completa</span>
            <span className="count">{read.length}</span>
          </div>
          {read.length === 0 && <div className="empty">Sin correos abiertos</div>}
          {read.map(m => <MailRow key={m.id} m={m} locked={false} onSelect={onSelectGap}/>)}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PendingView });
