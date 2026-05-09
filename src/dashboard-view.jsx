/* Dashboard view — operator activity, top days, alerts, totals */
function BarRow({ label, value, max, color, alt, dotColor }) {
  const pct = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="bar-row">
      <div className="lbl">
        {dotColor && <span className="dot" style={{ background: dotColor }}></span>}
        {label}
      </div>
      <div className="bar">
        <div className={clsx('fill', alt && 'alt')} style={{ width: pct + '%', background: color }}></div>
      </div>
      <div className="num">{value}</div>
    </div>
  );
}

function DashboardView({ onSelectDate }) {
  const ops = WEFLY.operatorBreakdown();
  const opsMax = Math.max(...ops.map(o => o.pax), 1);
  const days = WEFLY.topDays(12);
  const daysMax = Math.max(...days.map(d => d.pax), 1);
  const alerts = WEFLY.buildAlerts();
  const totals = WEFLY.totalsByDateOp();
  const opCols = [...new Set(WEFLY.events.map(e => e.calendar))]
    .sort((a, b) => (WEFLY.OP_LABEL[a] || a).localeCompare(WEFLY.OP_LABEL[b] || b));

  const grandTotal = totals.reduce((s, r) => s + r.total, 0);
  const opTotals = {};
  totals.forEach(r => {
    opCols.forEach(c => {
      opTotals[c] = (opTotals[c] || 0) + (r.ops[c] || 0);
    });
  });

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <div className="ch">
            <h3><span className="dot-op" style={{ background: 'var(--amber)' }}></span> Actividad por operador</h3>
            <span className="ch-tag">{WEFLY.events.length} eventos · {WEFLY.events.reduce((s,e)=>s+e.pax,0)} pax</span>
          </div>
          <div className="cb">
            <div className="bar-list">
              {ops.map(o => (
                <BarRow key={o.calendar} label={o.label} value={o.pax} max={opsMax}
                        dotColor={o.color}
                        color={`linear-gradient(90deg, ${o.color}, color-mix(in oklch, ${o.color} 60%, white))`}/>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <h3><span className="dot-op" style={{ background: 'var(--info)' }}></span> Días con más pasajeros</h3>
            <span className="ch-tag">top {days.length}</span>
          </div>
          <div className="cb">
            <div className="bar-list">
              {days.map(d => {
                const lbl = WEFLY.dateLabel(d.date);
                return (
                  <BarRow key={d.date}
                          label={`${lbl.dow.slice(0,3)} ${lbl.dom} ${lbl.mon}`}
                          value={d.pax} max={daysMax} alt
                          dotColor="var(--info)"/>
                );
              })}
              {days.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Sin datos</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="ch">
            <h3><span className="dot-op" style={{ background: 'var(--bad)' }}></span> Alertas operativas</h3>
            <span className="ch-tag">{alerts.length} activas</span>
          </div>
          <div className="cb">
            <div className="alerts-list">
              {alerts.map((a, i) => (
                <div key={i} className={'alert-row ' + a.kind}>
                  <div className="ico">
                    <Icon name={a.kind === 'bad' ? 'warn' : a.kind === 'warn' ? 'warn' : 'info'} size={16}/>
                  </div>
                  <div>
                    <div className="ttl">{a.title}</div>
                    <div className="sub">{a.sub}</div>
                  </div>
                  <div className="when">{a.when}</div>
                </div>
              ))}
              {alerts.length === 0 && <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Sin alertas activas</div>}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <h3><span className="dot-op" style={{ background: 'var(--ok)' }}></span> Totales por día · operador</h3>
            <span className="ch-tag">{grandTotal} pax · {totals.length} días</span>
          </div>
          <div className="cb" style={{ padding: 0, maxHeight: 360, overflow: 'auto' }}>
            <table className="tt">
              <thead>
                <tr>
                  <th>Día</th>
                  {opCols.map(c => <th className="num" key={c}>{WEFLY.opLabel(c)}</th>)}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {totals.map(r => {
                  const lbl = WEFLY.dateLabel(r.date);
                  return (
                    <tr key={r.date} onClick={() => onSelectDate && onSelectDate(r.date)} style={{ cursor: 'pointer' }}>
                      <td>{lbl.dow.slice(0,3)} {lbl.dom} {lbl.mon}</td>
                      {opCols.map(c => <td className="num" key={c}>{r.ops[c] || ''}</td>)}
                      <td className="num"><b>{r.total}</b></td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td>Total</td>
                  {opCols.map(c => <td className="num" key={c}>{opTotals[c] || 0}</td>)}
                  <td className="num">{grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { DashboardView });
