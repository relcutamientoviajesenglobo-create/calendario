/* Full-detail table view */
function TableView({ search, dateRange, calendarFilter, statusFilter, onSelect }) {
  const list = useMemo(() => {
    return WEFLY.events.filter(e => {
      if (search) {
        const q = search.toLowerCase();
        // Search incluye name + operador + summary + phone + email + pickup + staff + reserva (paridad backup)
        const hay = [e.name, WEFLY.opLabel(e.calendar), e.rawSummary,
                     e.phone, e.email, e.pickup, e.staff, e.reserva].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (calendarFilter && e.calendar !== calendarFilter) return false;
      if (dateRange[0] && e.date < dateRange[0]) return false;
      if (dateRange[1] && e.date > dateRange[1]) return false;
      if (statusFilter) {
        if (statusFilter === 'paid' && !e.flags.paid) return false;
        if (statusFilter === 'unpaid' && e.flags.paid) return false;
        if (statusFilter === 'hotel' && !e.flags.hotel) return false;
        if (statusFilter === 'noted' && !e.flags.noted) return false;
      }
      return true;
    });
  }, [search, dateRange, calendarFilter, statusFilter]);

  const totalPax = list.reduce((s, e) => s + e.pax, 0);

  return (
    <div className="tbl-wrap">
      <div className="tbl-count">
        <b>{list.length}</b> eventos
        <span style={{ color: 'var(--ink-4)' }}>·</span>
        <b>{totalPax}</b> pasajeros
        <span style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>Click sobre una fila para ver detalle</span>
      </div>
      <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
        <table className="full-tbl">
          <thead>
            <tr>
              <th>Fecha</th><th>Hora</th><th>Operador</th><th>Pasajero</th>
              <th className="num">Pax</th><th>Estado</th><th>Pickup</th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => {
              const lbl = WEFLY.dateLabel(e.date);
              const status = e.flags.paid ? 'ok' : e.flags.noted ? 'warn' : 'muted';
              const statusLabel = e.flags.paid ? 'Pagado' : e.flags.noted ? 'En proceso' : 'Pendiente';
              return (
                <tr key={e.id} onClick={() => onSelect && onSelect(e)}>
                  <td>{lbl.dow.slice(0,3)} {lbl.dom} {lbl.mon}</td>
                  <td className="mono">{e.timeKnown ? fmtTime(e.time) : '—'}</td>
                  <td><OpTag cal={e.calendar}/></td>
                  <td className="name-cell">{e.name}</td>
                  <td className="num pax-cell">{e.pax}</td>
                  <td><Pill tone={status}>{statusLabel}</Pill></td>
                  <td>{e.flags.hotel ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--plum)' }}><Icon name="hotel" size={13}/> Hotel</span> : <span style={{ color: 'var(--ink-4)' }}>—</span>}</td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--ink-3)' }}>Sin resultados con los filtros aplicados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { TableView });
