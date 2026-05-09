function Topbar({ view, onRefresh, onExport, onPrint }) {
  const titles = {
    briefing:  { h: 'Briefing', sub: 'Vista general · operación de hoy y mañana' },
    pending:   { h: 'Calendario · Correo', sub: 'Reservas en calendario vs reservas pendientes en correo' },
    dashboard: { h: 'Resumen operativo', sub: 'Operadores · alertas · totales por día' },
    table:     { h: 'Tabla de eventos', sub: 'Filtra y exporta el detalle completo' },
    calendar:  { h: 'Calendario mensual', sub: 'Vista de mes con pasajeros por día' },
  };
  const t = titles[view] || titles.briefing;
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="tb-title">
          <h1>{t.h}</h1>
          <span className="crumb">{t.sub}</span>
        </div>
        <div className="tb-right">
          <button className="btn ghost" onClick={onExport} title="Exportar CSV"><Icon name="download" size={14}/> CSV</button>
          <button className="btn ghost" onClick={onPrint}  title="Imprimir ruta del día"><Icon name="printer" size={14}/> Ruta PDF</button>
          <button className="btn primary" onClick={onRefresh}><Icon name="refresh" size={14}/> Actualizar</button>
        </div>
      </div>
    </header>
  );
}

Object.assign(window, { Topbar });
