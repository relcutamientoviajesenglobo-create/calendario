/* CriticalGaps — lista de reservas sin agendar para el día seleccionado
 * (HOY o MAÑANA). Si no se pasa `date`, usa TOMORROW por compat.
 */
function CriticalGaps({ onSelect, date }) {
  const targetDate = date || WEFLY.TOMORROW;
  const isToday = targetDate === WEFLY.TODAY;
  const gaps = WEFLY.gaps.filter(g => g.fecha === targetDate);
  const dayWord = isToday ? 'hoy' : 'mañana';

  if (!gaps.length) {
    return (
      <div className="brief-side empty">
        <div className="brief-side-head">
          <div className="ttl">
            <span className="icon-warn" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}><Icon name="check" size={13}/></span>
            Sin agendar · {dayWord}
          </div>
          <span className="num zero">0</span>
        </div>
        <div className="brief-empty">
          <div className="check"><Icon name="check" size={22}/></div>
          <div className="ttl">Todas las reservas agendadas</div>
          <div className="sub">No hay pasajeros pendientes para el día de {dayWord}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="brief-side">
      <div className="brief-side-head">
        <div className="ttl">
          <span className="icon-warn">!</span>
          Sin agendar · {dayWord}
        </div>
        <span className="num">{gaps.length}</span>
      </div>
      <div className="brief-side-body">
        {gaps.map((g, i) => (
          <div className="gap-row" key={i} onClick={() => onSelect && onSelect(g)}>
            <div className="pill-time">{g.hora || '—'}</div>
            <div>
              <div className="nm">
                <span className="pax">{g.pax}P</span>
                <span className="name">{g.nombre}</span>
              </div>
              <div className="meta">
                <span className="src">{g.fuente}</span>
                {g.producto && <span>· {g.producto}</span>}
                {g.phone && <span>· {g.phone}</span>}
              </div>
            </div>
            <div className="right">
              <div className="res">{g.reserva}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { CriticalGaps });
