/* App composition + state management */

function KpiStrip() {
  const total = WEFLY.events.length;
  const totalPax = WEFLY.events.reduce((s, e) => s + e.pax, 0);
  const ops = WEFLY.operatorBreakdown();
  const hotelPickups = WEFLY.events.filter(e => e.flags.hotel).length;
  const gapTotal = WEFLY.gaps.length;

  return (
    <div className="kpi-strip">
      <div className="kpi">
        <div className="label">Eventos en ventana</div>
        <div className="value">{total}</div>
        <div className="sub"><b>{totalPax}</b> pasajeros · próximos 16 días</div>
      </div>
      <div className="kpi">
        <div className="label">Operadores activos</div>
        <div className="value">{ops.length}</div>
        <div className="sub">Líder: <b>{ops[0]?.label || '—'}</b> con <b>{ops[0]?.pax || 0}</b> pax</div>
      </div>
      <div className="kpi">
        <div className="label">Pickups en hotel</div>
        <div className="value">{hotelPickups}</div>
        <div className="sub">requieren coordinación de transporte</div>
      </div>
      <div className="kpi">
        <div className="label">Sin agendar · ventana</div>
        <div className="value" style={{ color: gapTotal ? 'var(--bad)' : 'var(--ok)' }}>{gapTotal}</div>
        <div className="sub">{gapTotal ? 'Reservas pendientes de pasar a calendario' : 'Todas las reservas agendadas'}</div>
      </div>
    </div>
  );
}

function FilterBar({ search, setSearch, dateRange, setDateRange, calendarFilter, setCalendarFilter, statusFilter, setStatusFilter, showStatus, onApply, onClear }) {
  const calendars = [...new Set(WEFLY.events.map(e => e.calendar))].sort();
  const [d1, setD1] = useState(dateRange[0]);
  const [d2, setD2] = useState(dateRange[1]);
  const dirty = d1 !== dateRange[0] || d2 !== dateRange[1];
  return (
    <div className="filters">
      <input className="search" placeholder="Buscar nombre, operador, resumen…" value={search} onChange={e => setSearch(e.target.value)}/>
      <select value={calendarFilter} onChange={e => setCalendarFilter(e.target.value)}>
        <option value="">Todos los calendarios</option>
        {calendars.map(c => <option key={c} value={c}>{WEFLY.opLabel(c)}</option>)}
      </select>
      {showStatus && (
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="paid">Pagado</option>
          <option value="unpaid">Pendiente</option>
          <option value="hotel">Hotel pickup</option>
          <option value="noted">Pickup noted</option>
        </select>
      )}
      <span className={clsx('date-range', dirty && 'dirty')} title="Rango de fechas">
        <input type="date" value={d1} onChange={e => setD1(e.target.value)} />
        <span className="dr-sep">→</span>
        <input type="date" value={d2} onChange={e => setD2(e.target.value)} />
        <button className="dr-apply" onClick={() => {
          // Auto-swap si invierten
          const a = d1, b = d2;
          if (a && b && a > b) { setD1(b); setD2(a); setDateRange([b, a]); }
          else { setDateRange([a, b]); }
        }} title="Aplicar rango">Aplicar</button>
      </span>
      <button className="btn" onClick={() => {
        setSearch(''); setD1(''); setD2(''); setDateRange(['','']);
        setCalendarFilter(''); setStatusFilter('');
      }}>↻ Limpiar</button>
    </div>
  );
}

function App() {
  const [view, setView] = useState('briefing');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState(['', '']);
  const [calendarFilter, setCalendarFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState(null);
  const [tick, setTick] = useState(0); // forzar re-render cuando WEFLY cambia
  const [loadState, setLoadState] = useState(window.WEFLY?._mode || 'loading');

  // Listener: cuando data.js termina el fetch inicial o cuando un Refresh se completa
  useEffect(() => {
    function onLoaded() { setLoadState('live'); setTick(t => t + 1); }
    function onError(e)  { setLoadState('error'); }
    function onReloaded(){ setTick(t => t + 1); }
    window.addEventListener('wefly:loaded', onLoaded);
    window.addEventListener('wefly:error', onError);
    window.addEventListener('wefly:reloaded', onReloaded);
    // Si data.js ya terminó antes de montar el componente
    if (window.WEFLY?._mode === 'live') setLoadState('live');
    if (window.WEFLY?._mode === 'inline') setLoadState('live');
    return () => {
      window.removeEventListener('wefly:loaded', onLoaded);
      window.removeEventListener('wefly:error', onError);
      window.removeEventListener('wefly:reloaded', onReloaded);
    };
  }, []);

  const counts = {
    events: WEFLY.events.length,
    pending: WEFLY.gaps.length,
  };

  function jumpToTomorrow() {
    setView('table');
    setDateRange([WEFLY.TOMORROW, WEFLY.TOMORROW]);
  }
  function showGapsList() { setView('pending'); }

  function exportCSV() {
    const rows = [['fecha','hora','operador','nombre','pax','pagado','hotel','resumen']];
    WEFLY.events.forEach(e => {
      rows.push([e.date, e.time, WEFLY.opLabel(e.calendar), e.name, e.pax,
                 e.flags.paid ? 'sí' : 'no', e.flags.hotel ? 'sí' : 'no',
                 e.rawSummary.replace(/[",]/g,' ')]);
    });
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'wefly-eventos.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function printRoute() { window.print(); }

  // Loading state inicial
  if (loadState === 'loading' && WEFLY.events.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div className="sb-mark" style={{ width: 64, height: 64, fontSize: 24, margin: '0 auto 18px' }}>WF</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Cargando dashboard</div>
          <div style={{ color: 'var(--ink-3)', fontSize: 13.5 }}>Consultando Google Calendar · Gmail · Turitop…</div>
          <div style={{ marginTop: 24, fontSize: 12, color: 'var(--ink-4)' }}>Apps Script puede tardar 30–60s en cold start</div>
        </div>
      </div>
    );
  }

  // Error state
  if (loadState === 'error' && WEFLY.events.length === 0) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center', padding: 40, maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Error al cargar</div>
          <div style={{ color: 'var(--ink-3)', fontSize: 13.5, marginBottom: 18 }}>
            {WEFLY._error || 'No se pudo conectar con Apps Script'}
          </div>
          <button className="btn primary" onClick={() => location.reload()}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar view={view} setView={setView} counts={counts}/>
      <div className="main">
        <Topbar view={view}
                onRefresh={() => setRefreshing(true)}
                onExport={exportCSV}
                onPrint={printRoute}/>
        <div className="content">
          {view === 'briefing' && (
            <>
              <div className="briefing">
                <HeroTomorrow onJump={jumpToTomorrow} onShowGaps={showGapsList}/>
                <CriticalGaps onSelect={g => setModal({ gap: g })}/>
              </div>
              <KpiStrip/>
              <DashboardView onSelectDate={d => setModal({ date: d })}/>
            </>
          )}

          {view === 'pending' && (
            <>
              <FilterBar search={search} setSearch={setSearch}
                         dateRange={dateRange} setDateRange={setDateRange}
                         calendarFilter={calendarFilter} setCalendarFilter={setCalendarFilter}
                         statusFilter={statusFilter} setStatusFilter={setStatusFilter}/>
              <PendingView search={search}
                           onSelectEvent={e => setModal({ event: e })}
                           onSelectGap={g => setModal({ gap: g })}/>
            </>
          )}

          {view === 'dashboard' && (
            <>
              <KpiStrip/>
              <DashboardView onSelectDate={d => setModal({ date: d })}/>
            </>
          )}

          {view === 'table' && (
            <>
              <FilterBar search={search} setSearch={setSearch}
                         dateRange={dateRange} setDateRange={setDateRange}
                         calendarFilter={calendarFilter} setCalendarFilter={setCalendarFilter}
                         statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                         showStatus/>
              <TableView search={search} dateRange={dateRange}
                         calendarFilter={calendarFilter} statusFilter={statusFilter}
                         onSelect={e => setModal({ event: e })}/>
            </>
          )}

          {view === 'calendar' && (
            <CalendarView onSelectDate={d => setModal({ date: d })}/>
          )}
        </div>
      </div>

      <RefreshModal open={refreshing} onClose={() => setRefreshing(false)}/>
      <EventModal
        event={modal?.event}
        gap={modal?.gap}
        dateBundle={modal?.date}
        onClose={() => setModal(null)}/>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
