/* Modals: refresh real + event/gap detail con CTA Agendar al Calendar */

// ── Refresh Modal (real, no placeholder) ─────────────────────────────
// Hace 4 fetches reales en serie y muestra el progreso. Al terminar
// dispara `wefly:reloaded` con el nuevo estado y cierra.
function RefreshModal({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [secs, setSecs] = useState(0);
  const [hints, setHints] = useState({}); // { cal: '92 eventos', mail: ... }

  const stepDefs = [
    { key: 'cal',  label: 'Google Calendar · 5 calendarios' },
    { key: 'mail', label: 'Gmail · vuelosenglobomx@' },
    { key: 'tt',   label: 'Turitop · API + correos' },
    { key: 'mtch', label: 'Cruce de fuentes · matching' },
  ];

  useEffect(() => {
    if (!open) { setStep(0); setSecs(0); setHints({}); return; }
    let alive = true;
    const t0 = Date.now();
    const tick = setInterval(() => alive && setSecs(Math.floor((Date.now() - t0) / 1000)), 250);

    (async () => {
      try {
        // Step 1: Calendar (vía endpoint default del Apps Script)
        if (!alive) return;
        setStep(1);
        const dashRes = await fetch(window.APPS_SCRIPT_URL + '?t=' + Date.now(), {
          signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(90000) : undefined,
        });
        const dash = dashRes.ok ? await dashRes.json() : null;
        const calCount = dash?.events?.length || 0;
        if (alive) setHints(h => ({ ...h, cal: `${calCount} eventos` }));

        // Step 2: Gmail (cuenta primary — Bookeo/Viator desde el Apps Script principal)
        if (!alive) return;
        setStep(2);
        const bkCount = (dash?.bookeo_emails || []).length;
        const viCount = (dash?.viator_emails || []).length;
        if (alive) setHints(h => ({ ...h, mail: `${bkCount} Bookeo · ${viCount} Viator` }));

        // Step 3: Turitop (gaps estáticos + email reader live)
        if (!alive) return;
        setStep(3);
        const [gapsRes, emRes] = await Promise.allSettled([
          fetch('./reservas_sin_agendar.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
          fetch(window.TURITOP_EMAIL_READER_URL + '?action=turitop_emails&t=' + Date.now()).then(r => r.ok ? r.json() : null),
        ]);
        const gapsData = gapsRes.status === 'fulfilled' ? gapsRes.value : null;
        const emData = emRes.status === 'fulfilled' ? emRes.value : null;
        const ttCount = (gapsData?.fuentes?.Turitop?.total) || 0;
        const emCount = emData?.emails?.length || 0;
        if (alive) setHints(h => ({ ...h, tt: `${ttCount} API · ${emCount} correos` }));

        // Step 4: Matching (rebuild WEFLY state with new data)
        if (!alive) return;
        setStep(4);
        // Adaptar dash → RAW (mismo normalize que en data.js)
        const CAL_CANONICAL = {
          'Primary': 'PRIMARY', 'VGMX': 'VGMX', 'GAT': 'GAT',
          'WE FLY - BOOKEO': 'BOOKEO', 'VIATOR / TRIP ADVISOR': 'VIATOR',
          'GAMX-MONSE': 'GAMX_MONSE', 'RECEPCION WE FLY': 'RECEPCION',
          'BOKUN': 'BOKUN', 'SOLO Bokun': 'SOLO_BOKUN',
        };
        function normCal(c) {
          if (!c) return 'OTHER';
          if (CAL_CANONICAL[c]) return CAL_CANONICAL[c];
          const u = c.toUpperCase();
          if (u.includes('BOOKEO')) return 'BOOKEO';
          if (u.includes('VIATOR')) return 'VIATOR';
          if (u.includes('VGMX')) return 'VGMX';
          if (u.includes('GAT')) return 'GAT';
          if (u.includes('PRIMARY')) return 'PRIMARY';
          return c.toUpperCase().replace(/\s+/g, '_').replace(/\//g, '_');
        }
        function isDisp(e) {
          const n = (e.name || e.title_raw || '').toUpperCase().trim();
          return n === 'DISPONIBILIDAD' || n === 'DISPONIBLE' || (e.status === 'tentativo' && (e.pax || 0) === 0);
        }
        const RAW = { by_date: {}, total_events: 0, generated_at: dash?.generated_at || '' };
        (dash?.events || []).forEach(e => {
          if (isDisp(e)) return;
          const d = e.date || (e.datetime || e.start || '').slice(0, 10);
          if (!d) return;
          if (!RAW.by_date[d]) RAW.by_date[d] = [];
          RAW.by_date[d].push({
            summary: e.title_raw || e.summary || e.name || '',
            time: e.time || '',
            calendar: normCal(e.calendar),
            _pax: e.pax, _name: e.name,
            _staff: e.staff || '', _pickup: e.pickup || '',
            _phone: e.phone || '', _email: e.email || '',
            _reserva: e.reserva || '', _total: e.total || '',
            _total_weight: e.total_weight || 0,
            _weights: e.weights || [], _service: e.service || '',
            _status: e.status || '',
            _celebration: !!e.celebration, _overweight: !!e.overweight,
          });
          RAW.total_events++;
        });
        const GAPS = gapsData || { bookings: [], total_sin_agendar: 0 };
        const EMAILS = (emData && emData.emails) ? emData.emails : [];

        // Re-construir WEFLY usando la función buildState global expuesta
        if (window.__WEFLY_BUILD__) {
          window.WEFLY = window.__WEFLY_BUILD__(RAW, GAPS, EMAILS);
          window.WEFLY._mode = 'live';
          window.WEFLY._fetchTs = Date.now();
        }
        const matched = (gapsData?.fuentes?.Turitop?.matched) || 0;
        const total   = (gapsData?.fuentes?.Turitop?.total) || 0;
        if (alive) setHints(h => ({ ...h, mtch: `${matched}/${total} matched` }));

        // Done — esperar 600ms y cerrar
        if (!alive) return;
        setTimeout(() => {
          if (!alive) return;
          window.dispatchEvent(new CustomEvent('wefly:reloaded', { detail: window.WEFLY }));
          onClose && onClose();
        }, 600);
      } catch (err) {
        console.error('[refresh modal]', err);
        if (alive) setHints(h => ({ ...h, error: err.message || String(err) }));
      }
    })();

    return () => { alive = false; clearInterval(tick); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="rmw" onClick={e => e.stopPropagation()}>
        <div className="head">
          <div className="ico"><div className="dot"></div></div>
          <div>
            <div className="ttl">Actualizando en vivo</div>
            <div className="sub">Consultando Google Calendar · Gmail · Turitop</div>
          </div>
          <div className="timer">{secs}s</div>
        </div>
        <div className="body">
          {stepDefs.map((s, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : '';
            const hint = hints[s.key];
            return (
              <div key={s.key} className={'step ' + state}>
                <div className="sd"></div>
                <div className="sl">{s.label}</div>
                <div className="sh">{i < step && hint ? hint : i === step ? '…' : '—'}</div>
              </div>
            );
          })}
          {hints.error && (
            <div style={{ color: 'var(--bad)', fontSize: 12.5, marginTop: 8, padding: 10, background: 'var(--bad-tint)', borderRadius: 8 }}>
              ⚠ {hints.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Google Calendar URL builder (formato IDÉNTICO al backup) ─────────
// Title: "🤖 *NP Nombre Capitalizado"
// Description: 11 líneas con emojis (No.Reserva, Nombre, Fecha, Servicio, etc.)
// Duration: 3 horas. Location: Teotihuacán, México. src: weflymx@gmail.com
function buildAgendarPayload(g) {
  const rawName = (g.nombre || 'Sin nombre').trim().replace(/\s+/g, ' ');
  const nameNice = rawName.replace(/\b([\wáéíóúñ])([\wáéíóúñ]*)/gi, (m, f, r) => f.toUpperCase() + r.toLowerCase());
  const paxNum = parseInt(g.pax) || 1;
  const calName = 'We fly';
  const title = '🤖 *' + paxNum + 'P ' + nameNice;
  const descLines = [
    '📝 No.Reserva: ' + (g.reserva || '-'),
    '👤 Nombre: ' + nameNice,
    '📅 Fecha de Vuelo: ' + (g.fecha || '') + (g.hora ? ' ' + g.hora : ''),
    '✈️ Tipo de Servicio: ' + (g.producto || '-'),
    '👥 Participantes: ' + paxNum + ' pax',
  ];
  if (g.email) descLines.push('📧 Email: ' + g.email);
  if (g.phone) descLines.push('📱 Tel: ' + g.phone);
  if (g.total) descLines.push('💰 Total: ' + g.total);
  if (g.pesos) descLines.push('⚖️ Pesos: ' + g.pesos);
  if (g.estado) descLines.push('🏷️ Estado: ' + g.estado);
  descLines.push('');
  descLines.push('🤖 Agendado manualmente desde WE FLY Gap Detector');
  descLines.push('🏷️ Fuente: ' + (g.fuente || calName));
  descLines.push('📌 Calendario destino sugerido: ' + calName);
  return { title, description: descLines.join('\n'), calName, startDate: g.fecha, startTime: g.hora || '06:00' };
}

function googleCalendarUrl(gap) {
  const p = buildAgendarPayload(gap);
  const [yr, mo, d] = (p.startDate || '').split('-');
  const [hh, mm] = (p.startTime || '06:00').split(':');
  if (!yr || !mo || !d) return null;
  const pad = n => String(n).padStart(2, '0');
  const startStr = yr + pad(mo) + pad(d) + 'T' + pad(hh) + pad(mm) + '00';
  const startMs = new Date(+yr, +mo - 1, +d, +hh, +mm).getTime();
  const endDate = new Date(startMs + 3 * 3600 * 1000);  // +3 horas (no 4)
  const endStr = endDate.getFullYear() + pad(endDate.getMonth()+1) + pad(endDate.getDate()) + 'T' + pad(endDate.getHours()) + pad(endDate.getMinutes()) + '00';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: p.title,
    dates: startStr + '/' + endStr,
    details: p.description,
    location: 'Teotihuacán, México',
    src: 'weflymx@gmail.com',  // pre-selecciona calendario WE FLY
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

function EventModal({ event, gap, dateBundle, onClose }) {
  if (!event && !gap && !dateBundle) return null;
  let title, meta, body;
  if (event) {
    const lbl = WEFLY.dateLabel(event.date);
    title = event.name;
    meta = `${lbl.full} · ${event.timeKnown ? fmtTime(event.time) : 'sin hora'} · ${WEFLY.opLabel(event.calendar)}`;
    body = (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill tone={event.flags.paid ? 'ok' : 'muted'}>{event.flags.paid ? 'Pagado' : 'Pendiente de pago'}</Pill>
          {event.flags.noted && <Pill tone="warn">Pickup noted</Pill>}
          {event.flags.hotel && <Pill tone="ok">Pickup en hotel</Pill>}
          {event.flags.privado && <Pill tone="bad">Privado</Pill>}
          {event.celebration && <Pill tone="warn">🎂 Celebración</Pill>}
          {event.overweight && <Pill tone="bad">⚠ Sobrepeso</Pill>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field k="Pasajeros" v={`${event.pax}P`} />
          <Field k="Operador" v={WEFLY.opLabel(event.calendar)} />
          <Field k="Fecha" v={lbl.full} />
          <Field k="Hora" v={event.timeKnown ? fmtTime(event.time) : 'Sin confirmar'} />
          {event.total_weight ? <Field k="Peso total" v={`${event.total_weight} kg`} /> : null}
          {event.staff ? <Field k="Staff" v={event.staff} /> : null}
          {event.pickup ? <Field k="Pickup" v={event.pickup} /> : null}
          {event.phone ? <Field k="Teléfono" v={event.phone} /> : null}
          {event.email ? <Field k="Email" v={event.email} /> : null}
          {event.reserva ? <Field k="Reserva" v={event.reserva} mono /> : null}
          {event.total ? <Field k="Total" v={event.total} /> : null}
          {event.service ? <Field k="Servicio" v={event.service} /> : null}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6 }}>Resumen original</div>
          <div className="mono" style={{ fontFamily: 'var(--mono)', fontSize: 12.5, padding: 10, background: 'var(--panel-2)', borderRadius: 8, color: 'var(--ink-2)' }}>{event.rawSummary}</div>
        </div>
      </div>
    );
  } else if (gap) {
    title = gap.nombre || gap.reserva || 'Reserva';
    meta = `${WEFLY.dateLabel(gap.fecha).full} · ${gap.hora || '—'} · ${gap.fuente || 'Turitop'}`;
    body = (
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Pill tone="bad">Sin agendar</Pill>
          <Pill tone="muted">{gap.fuente || 'Turitop'}</Pill>
          {gap.estado && <Pill tone="ok">{gap.estado}</Pill>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field k="Reserva" v={gap.reserva} mono />
          <Field k="Pasajeros" v={`${gap.pax}P`} />
          <Field k="Producto" v={gap.producto} />
          <Field k="Total" v={gap.total ? `$${gap.total}` : ''} />
          <Field k="Email" v={gap.email} />
          <Field k="Teléfono" v={gap.phone} />
          {gap.pesos && <Field k="Pesos pasajeros" v={gap.pesos} />}
        </div>
        <a className="btn amber" href={googleCalendarUrl(gap)} target="_blank" rel="noopener noreferrer"
           style={{ alignSelf: 'flex-start', textDecoration: 'none' }}>
          <Icon name="calendar" size={14}/> Agregar a Google Calendar
        </a>
      </div>
    );
  } else {
    const evs = WEFLY.eventsByDate(dateBundle);
    const lbl = WEFLY.dateLabel(dateBundle);
    title = `${lbl.dow.charAt(0).toUpperCase() + lbl.dow.slice(1)} ${lbl.dom} ${lbl.mon}`;
    meta = `${evs.length} vuelos · ${evs.reduce((s, e) => s + e.pax, 0)} pasajeros`;
    body = (
      <div style={{ display: 'grid', gap: 4 }}>
        {evs.map(e => (
          <div key={e.id} className="rsv" style={{ margin: 0 }}>
            <div className={clsx('time', !e.timeKnown && 'empty')}>{e.timeKnown ? fmtTime(e.time) : '—'}</div>
            <div>
              <div className="name"><span className="pax">{e.pax}P</span><span className="nm-text">{e.name}</span></div>
              <div className="meta"><OpTag cal={e.calendar}/></div>
            </div>
            <span className="flags">
              {e.flags.paid  && <span className="flag ok"   title="Pagado"><Icon name="check" size={11}/></span>}
              {e.flags.noted && <span className="flag note" title="Pickup noted"><Icon name="note" size={11}/></span>}
              {e.flags.hotel && <span className="flag hot"  title="Pickup en hotel"><Icon name="hotel" size={11}/></span>}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            <div className="modal-meta">{meta}</div>
          </div>
          <button className="btn ghost" onClick={onClose}><Icon name="x" size={14}/></button>
        </div>
        <div className="modal-body">{body}</div>
      </div>
    </div>
  );
}

function Field({ k, v, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 4 }}>{k}</div>
      <div style={{ fontSize: 13.5, fontFamily: mono ? 'var(--mono)' : 'inherit', wordBreak: 'break-word' }}>{v || <span style={{ color: 'var(--ink-4)' }}>—</span>}</div>
    </div>
  );
}

Object.assign(window, { RefreshModal, EventModal });
