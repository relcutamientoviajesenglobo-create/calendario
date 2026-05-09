/* Monthly calendar grid view */
function CalendarView({ onSelectDate }) {
  // anchor month to TODAY's snapshot
  const dates = WEFLY.events.map(e => e.date);
  const minD = dates.length ? dates.reduce((a, b) => a < b ? a : b) : WEFLY.TODAY;
  const [yyyy, mm] = WEFLY.TODAY.split('-').map(Number);
  const [cur, setCur] = useState({ y: yyyy, m: mm });

  const monthName = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][cur.m - 1];

  // Compute grid: monday-first
  const first = new Date(Date.UTC(cur.y, cur.m - 1, 1));
  const startDow = (first.getUTCDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(Date.UTC(cur.y, cur.m, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${cur.y}-${String(cur.m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evs = WEFLY.eventsByDate(iso);
    const pax = evs.reduce((s, e) => s + e.pax, 0);
    cells.push({ iso, d, evs, pax });
  }
  while (cells.length % 7) cells.push(null);

  const headers = ['L','M','X','J','V','S','D'];

  function shift(delta) {
    let y = cur.y, m = cur.m + delta;
    while (m > 12) { m -= 12; y += 1; }
    while (m < 1) { m += 12; y -= 1; }
    setCur({ y, m });
  }

  return (
    <>
      <div className="month-bar">
        <button className="btn ghost" onClick={() => shift(-1)}><Icon name="arrow-l" size={14}/> Anterior</button>
        <h2>{monthName.charAt(0).toUpperCase() + monthName.slice(1)} {cur.y}</h2>
        <button className="btn ghost" onClick={() => shift(1)}>Siguiente <Icon name="arrow-r" size={14}/></button>
      </div>
      <div className="cal-grid">
        {headers.map(h => <div className="cal-dh" key={h}>{h}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div className="cal-day empty" key={i}></div>;
          const isToday = c.iso === WEFLY.TODAY;
          return (
            <div key={i}
              className={clsx('cal-day', isToday && 'today')}
              onClick={() => c.evs.length && onSelectDate && onSelectDate(c.iso)}>
              <div className="num">
                <span>{c.d}</span>
                <span className={clsx('pax-tag', !c.pax && 'empty-tag')}>{c.pax || '—'}</span>
              </div>
              <div className="vd-list">
                {c.evs.slice(0, 4).map((e, k) => (
                  <div className="vd-item" key={k}>
                    <span className="dot" style={{ background: WEFLY.opColor(e.calendar) }}></span>
                    <span>{e.pax}P {e.name.split(' ').slice(0,2).join(' ')}</span>
                  </div>
                ))}
                {c.evs.length > 4 && <div className="more">+{c.evs.length - 4} más</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

Object.assign(window, { CalendarView });
