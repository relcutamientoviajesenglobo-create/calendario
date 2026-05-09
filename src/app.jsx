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

// ── Initial Loader ─────────────────────────────────────────────────
// Versión portada del backup mobile.html (spinner SVG con timer en
// el centro + steps en card), adaptada al palette amber del rediseño.
function InitialLoader() {
  const initial = window._weflyStepState || {};
  const seed = {
    cal:  initial.cal  || { state: 'pending', hint: '—' },
    mail: initial.mail || { state: 'pending', hint: '—' },
    tt:   initial.tt   || { state: 'pending', hint: '—' },
    mtch: initial.mtch || { state: 'pending', hint: '—' },
  };
  const [steps, setSteps] = useState(seed);
  const [secs, setSecs] = useState(0);
  const stepDefs = [
    { key: 'cal',  label: '9 calendarios de Google' },
    { key: 'tt',   label: 'Reservas sin agendar' },
    { key: 'mtch', label: 'Armando dashboard' },
  ];

  useEffect(() => {
    const t0 = Date.now();
    const tick = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 250);
    function onStep(e) {
      const { key, state, hint } = e.detail;
      setSteps(s => ({ ...s, [key]: { state, hint: hint || s[key]?.hint || '—' } }));
    }
    window.addEventListener('wefly:step', onStep);
    return () => { clearInterval(tick); window.removeEventListener('wefly:step', onStep); };
  }, []);

  return (
    <div className="ldr-overlay">
      <div className="ldr-card">
        <div className="ldr-spinner-wrap">
          <svg viewBox="0 0 72 72" className="ldr-svg">
            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(245,158,11,.18)" strokeWidth="5"/>
            <circle cx="36" cy="36" r="30" fill="none" stroke="url(#ldrGrad)" strokeWidth="5" strokeLinecap="round" strokeDasharray="60 130"/>
            <defs>
              <linearGradient id="ldrGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#F59E0B"/>
                <stop offset="100%" stopColor="#C2410C"/>
              </linearGradient>
            </defs>
          </svg>
          <div className="ldr-timer">{secs}s</div>
        </div>
        <h3 className="ldr-title">Actualizando en vivo</h3>
        <div className="ldr-sub">Consultando Google Calendar…</div>
        <div className="ldr-steps">
          {stepDefs.map(s => {
            const cur = steps[s.key];
            const cls = 'ldr-step ' + (cur.state === 'pending' ? '' : cur.state);
            return (
              <div key={s.key} className={cls}>
                <span className="ldr-dot"></span>
                <span className="ldr-lbl">{s.label}</span>
                <span className="ldr-hint">
                  {cur.state === 'done' ? (cur.hint || '✓')
                 : cur.state === 'active' ? '…'
                 : cur.state === 'error' ? '⚠'
                 : '—'}
                </span>
              </div>
            );
          })}
        </div>
        <div className="ldr-footer">Primera carga ~15-30s · Cache local 5 min</div>
      </div>
    </div>
  );
}

// Default del briefing según hora local: <11:00 → 'today', ≥11:00 → 'tomorrow'.
// El equipo termina la operación de la mañana ~11AM; después tiene sentido
// que el dashboard ya muestre el día siguiente.
function getDefaultBriefingMode() {
  const now = new Date();
  return now.getHours() < 11 ? 'today' : 'tomorrow';
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
  const [briefingMode, setBriefingMode] = useState(getDefaultBriefingMode());

  // Día efectivo del briefing (calculado a partir del modo + WEFLY)
  const briefingDate = briefingMode === 'today' ? WEFLY.TODAY : WEFLY.TOMORROW;

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

  // CTA "Ver agenda completa": va a la tabla filtrada al día del briefing
  // (HOY si estás antes de las 11, MAÑANA si después).
  function jumpToBriefingDay() {
    setView('table');
    setDateRange([briefingDate, briefingDate]);
  }
  function showGapsList() { setView('pending'); }

  // CSV export — formato IDÉNTICO al backup:
  // headers: date,time,calendar,name,pax,total_weight,status,staff,pickup,phone,email
  function exportCSV() {
    const header = ['date','time','calendar','name','pax','total_weight','status','staff','pickup','phone','email'];
    const lines = [header.join(',')];
    WEFLY.events.forEach(e => {
      const row = [e.date, e.time, WEFLY.opLabel(e.calendar), e.name, e.pax,
                   e.total_weight || '', e.status || '', e.staff || '',
                   e.pickup || '', e.phone || '', e.email || ''];
      lines.push(row.map(v => {
        const s = (v ?? '').toString().replace(/"/g, '""');
        return /[,"\n]/.test(s) ? `"${s}"` : s;
      }).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const today = WEFLY.TODAY || new Date().toISOString().slice(0,10);
    a.download = `wefly-logistica-${today}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  // Ruta del día PDF — formato IDÉNTICO al backup:
  // tabla 8 columnas (Hora, Operador, Pasajero, Pax, Peso, Pickup, Staff, Tel),
  // totals, fonts Google Sans, abre nueva ventana → window.print()
  function printRoute() {
    const today = WEFLY.TODAY;
    const evs = WEFLY.events
      .filter(e => e.date === today)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const totalPax = evs.reduce((a, e) => a + (e.pax || 0), 0);
    const totalKg  = evs.reduce((a, e) => a + (e.total_weight || 0), 0);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ruta WE FLY · ${today}</title>
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Google+Sans+Text:wght@400;500&display=swap" rel="stylesheet">
<style>
body{font-family:'Google Sans Text','Google Sans',sans-serif;padding:36px;color:#111;max-width:960px;margin:0 auto}
h1{font-family:'Google Sans',sans-serif;margin:0 0 4px;font-size:24px;letter-spacing:-.02em}
.sub{color:#666;font-size:13px;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{background:#f5f7fa;text-align:left;padding:10px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #333;font-family:'Google Sans',sans-serif}
td{padding:10px 8px;border-bottom:1px solid #e5e7eb;font-size:12.5px;vertical-align:top}
tr:nth-child(even) td{background:#fafbfc}
.num{font-family:'Google Sans',sans-serif;font-weight:700;text-align:right}
.totals{margin-top:24px;padding:16px 20px;background:#f5f7fa;border-radius:10px;font-family:'Google Sans',sans-serif;display:flex;gap:30px;font-size:14px}
.totals b{display:block;font-size:20px;margin-top:2px}
.foot{margin-top:28px;font-size:11px;color:#888;border-top:1px solid #e5e7eb;padding-top:12px}
@media print{body{padding:20px}.totals{background:#eee}}
</style></head><body>
<h1>✈ Ruta WE FLY · ${today}</h1>
<div class="sub">${evs.length} vuelos programados · ${totalPax} pasajeros · generado ${new Date().toLocaleString('es-MX')}</div>
<table>
  <thead><tr><th>Hora</th><th>Operador</th><th>Pasajero</th><th class="num">Pax</th><th class="num">Peso</th><th>Pickup</th><th>Staff</th><th>Tel</th></tr></thead>
  <tbody>
  ${evs.map(e => `<tr>
    <td><b>${esc(e.timeKnown ? e.time : '—')}</b></td>
    <td>${esc(WEFLY.opLabel(e.calendar))}</td>
    <td><b>${esc(e.name)}</b>${e.celebration ? ' 🎂' : ''}${e.overweight ? ' ⚠' : ''}</td>
    <td class="num">${e.pax || 0}</td>
    <td class="num">${e.total_weight ? e.total_weight + ' kg' : ''}</td>
    <td>${esc(e.pickup || '')}</td>
    <td>${esc(e.staff || '')}</td>
    <td>${esc(e.phone || '')}</td>
  </tr>`).join('')}
  </tbody>
</table>
<div class="totals">
  <div>Vuelos<b>${evs.length}</b></div>
  <div>Pasajeros<b>${totalPax}</b></div>
  <div>Peso total<b>${totalKg.toLocaleString()} kg</b></div>
</div>
<div class="foot">WE FLY · Logística de vuelos · Origen: Río Lerma 98 · Destino final: Ángel de la Independencia</div>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Permite popups para imprimir la ruta del día'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch(_){} }, 700);
  }

  // Loading state inicial — usa el mismo patrón visual del RefreshModal:
  // 4 steps animados (Calendar → Gmail → Turitop → Matching) con timer real
  // y hints de progreso emitidos por data.js (window event 'wefly:step').
  if (loadState === 'loading' && WEFLY.events.length === 0) {
    return <InitialLoader/>;
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
                <HeroTomorrow
                  date={briefingDate}
                  mode={briefingMode}
                  onToggleMode={setBriefingMode}
                  onJump={jumpToBriefingDay}
                  onShowGaps={showGapsList}/>
                <CriticalGaps date={briefingDate} onSelect={g => setModal({ gap: g })}/>
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
