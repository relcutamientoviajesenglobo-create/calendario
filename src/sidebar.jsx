function Sidebar({ view, setView, counts }) {
  const items = [
    { id: 'briefing', label: 'Briefing', icon: 'home' },
    { id: 'pending',  label: 'Calendario · Correo', icon: 'pending', badge: counts.pending, alert: counts.pending > 0 },
    { id: 'dashboard', label: 'Resumen operativo', icon: 'dashboard' },
    { id: 'table',     label: 'Tabla', icon: 'table', badge: counts.events },
    { id: 'calendar',  label: 'Calendario mensual', icon: 'calendar' },
  ];
  const generated = WEFLY.raw.generated_at || '—';
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-mark">WF</div>
        <div className="sb-brand-text">
          <div className="sb-brand-name">WE FLY</div>
          <div className="sb-brand-sub">Logística</div>
        </div>
      </div>

      <div className="sb-section-label">Operación</div>
      <nav className="sb-nav">
        {items.map(it => (
          <div key={it.id}
            className={clsx('sb-item', view === it.id && 'active', it.alert && 'alert')}
            onClick={() => setView(it.id)}>
            <Icon name={it.icon} size={17} />
            <span>{it.label}</span>
            {it.badge != null && it.badge > 0 && (
              <span className="sb-badge">{it.badge}</span>
            )}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="sb-foot-row">
          <span className="sb-live-dot"></span>
          <span>En vivo · Calendar + Gmail + Turitop</span>
        </div>
        <div className="sb-foot-row" style={{ color: 'var(--ink-4)', fontSize: 11 }}>
          Snapshot {generated}
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
