/* WE FLY data layer — fetch live + parsing
 *
 * Fuentes:
 *   1. APPS_SCRIPT_URL          → calendarios + Bookeo + Viator + Turitop API
 *   2. TURITOP_EMAIL_READER_URL → 104+ correos parseados de no-reply@turitop.com
 *
 * Estado en window.WEFLY:
 *   raw, gapsRaw, events, gaps, gapsTomorrow, emailQueue,
 *   NOW, TODAY, TOMORROW, opLabel, opColor, parseSummary,
 *   eventsByDate, paxOnDate, operatorBreakdown, topDays,
 *   totalsByDateOp, buildAlerts
 *
 * Bootstrap: si window.__WEFLY_DATA__ está pre-cargado, lo usa (modo offline);
 * si no, fetcha live al cargar y dispara `wefly:loaded` cuando termina.
 */
(function () {
  // ── Endpoints (mismos que el dashboard actual ya usa) ────────────────
  window.APPS_SCRIPT_URL = window.APPS_SCRIPT_URL ||
    'https://script.google.com/macros/s/AKfycbwCF-ZImgnsAwVV2a_CF4VG_UFUoFlAvyUY0dc8ALOiB_sWELnfQhXtqDSYgl8F53QKeA/exec';
  window.TURITOP_EMAIL_READER_URL = window.TURITOP_EMAIL_READER_URL ||
    'https://script.google.com/macros/s/AKfycbzApxUAjLhQvyQykWgH7BK4FRXTHOGBPbZGSRTtL2ZbLaVUXkWv0jalrd3Xs-xm82QgBQ/exec';

  // ── Operadores ────────────────────────────────────────────────────────
  const OP_LABEL = {
    PRIMARY: 'WE FLY', GAT: 'GAT', BOOKEO: 'Bookeo',
    VGMX: 'VGMX', VIATOR: 'Viator',
  };
  const OP_COLOR = {
    PRIMARY: 'var(--op-PRIMARY)', GAT: 'var(--op-GAT)',
    BOOKEO: 'var(--op-BOOKEO)',   VGMX: 'var(--op-VGMX)',
    VIATOR: 'var(--op-VIATOR)',
  };
  function opLabel(c) { return OP_LABEL[c] || c || 'Otro'; }
  function opColor(c) { return OP_COLOR[c] || 'var(--op-OTHER)'; }

  // ── Parser de summary ────────────────────────────────────────────────
  // Ejemplos: "✅📝🏨.*4P Eber Israel" / "📝✅.*3p Francini" / "*MOD 1P Morgan"
  function parseSummary(s) {
    const raw = String(s || '').trim();
    const flags = {
      paid:    raw.includes('✅'),
      noted:   raw.includes('📝'),
      hotel:   raw.includes('🏨'),
      privado: raw.includes('🔒') || /privad/i.test(raw),
      cortes:  raw.includes('🎁') || /cortes[ií]a/i.test(raw),
    };
    let body = raw.replace(/^[\p{Emoji}\p{Emoji_Component}\s\.\*]+/u, '');
    body = body.replace(/^\.+/, '').replace(/^\*+/, '').trim();
    let pax = 0;
    const paxM = body.match(/^(\d+)\s*[Pp][xX]?\b/);
    if (paxM) {
      pax = parseInt(paxM[1], 10);
      body = body.slice(paxM[0].length).trim();
    } else {
      const any = raw.match(/(\d+)\s*[Pp][xX]?\b/);
      if (any) pax = parseInt(any[1], 10);
    }
    const name = body.replace(/^[.\s\*]+/, '').trim() || '(sin nombre)';
    return { name, pax, flags };
  }

  // ── Helpers de fecha (TZ-local, no UTC) ──────────────────────────────
  function fmtLocalDate(d) {
    const x = new Date(d);
    return x.getFullYear() + '-' +
           String(x.getMonth() + 1).padStart(2, '0') + '-' +
           String(x.getDate()).padStart(2, '0');
  }
  function dateLabel(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][dt.getUTCDay()];
    const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][dt.getUTCMonth()];
    return { dow, dom: d, mon, full: `${dow} ${d} ${mon}` };
  }

  // ── Build state desde RAW + GAPS ──────────────────────────────────────
  function buildState(RAW, GAPS, EMAILS) {
    // events[]
    const events = [];
    const byDate = RAW.by_date || {};
    Object.keys(byDate).sort().forEach(date => {
      const arr = byDate[date] || {};
      const list = Array.isArray(arr) ? arr : Object.values(arr);
      list.forEach((ev, i) => {
        const p = parseSummary(ev.summary);
        // Si Apps Script ya entregó pax/name parseados, preferirlos sobre el regex
        const pax = (typeof ev._pax === 'number' && ev._pax > 0) ? ev._pax : p.pax;
        const name = (ev._name && ev._name.trim() && ev._name !== 'DISPONIBILIDAD') ? ev._name : p.name;
        events.push({
          id: date + ':' + i,
          date,
          time: (ev.time || '').trim() || '06:00',
          timeKnown: !!(ev.time && ev.time.trim()),
          calendar: ev.calendar || 'OTHER',
          rawSummary: ev.summary,
          // Campos extra del Apps Script live (para printRoute / exportCSV / Agendar)
          staff: ev._staff || '',
          pickup: ev._pickup || '',
          phone: ev._phone || '',
          email: ev._email || '',
          reserva: ev._reserva || '',
          total: ev._total || '',
          total_weight: ev._total_weight || 0,
          weights: ev._weights || [],
          service: ev._service || '',
          status: ev._status || '',
          celebration: !!ev._celebration,
          overweight: !!ev._overweight,
          ...p,
          pax, name,
        });
      });
    });
    events.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.time < b.time ? -1 : 1;
    });

    // NOW / TODAY / TOMORROW (anclados al snapshot generated_at)
    const NOW = (() => {
      const g = (RAW.generated_at || '').replace(' ', 'T');
      const d = g ? new Date(g) : new Date();
      return isNaN(d.getTime()) ? new Date() : d;
    })();
    const TODAY = fmtLocalDate(NOW);
    const TOMORROW = (() => {
      const t = new Date(NOW); t.setDate(t.getDate() + 1);
      return fmtLocalDate(t);
    })();
    function relativeLabel(iso) {
      if (iso === TODAY) return 'Hoy';
      if (iso === TOMORROW) return 'Mañana';
      return dateLabel(iso).full;
    }

    // gaps[] — combina:
    //   1) GAPS.bookings (de reservas_sin_agendar.json o gaps_flat live)
    //   2) Email reader: emails que no matchean con eventos del calendario
    const cal_keys = new Set();
    events.forEach(e => {
      // index para matching client-side rapido (reserva ID, email, phone last10)
      const txt = ((e.rawSummary || '') + ' ' + (e.name || '')).toLowerCase();
      cal_keys.add('name:' + (e.name || '').toLowerCase().trim());
    });
    function emailMatches(em) {
      // Match aproximado por nombre del email vs eventos del mismo día
      if (!em.fecha) return false;
      const evsOfDay = events.filter(e => e.date === em.fecha);
      const emName = (em.nombre || '').toLowerCase().trim();
      const emEmail = (em.email || '').toLowerCase().trim();
      const emRid = (em.reserva || '').toLowerCase();
      for (const ev of evsOfDay) {
        const evtxt = ((ev.rawSummary || '') + ' ' + (ev.name || '')).toLowerCase();
        if (emRid && evtxt.indexOf(emRid) !== -1) return true;
        if (emEmail && evtxt.indexOf(emEmail) !== -1) return true;
        if (emName && (ev.name || '').toLowerCase().indexOf(emName.split(' ')[0]) !== -1) return true;
      }
      return false;
    }

    const seenReservas = {};
    const allGaps = [];
    (GAPS.bookings || []).forEach(g => {
      const k = (g.reserva || '').toLowerCase();
      if (k) seenReservas[k] = true;
      allGaps.push(g);
    });
    // Window: hoy-1 .. hoy+15 (consistente con el dashboard actual)
    const winFrom = (() => { const d = new Date(NOW); d.setDate(d.getDate() - 1); return fmtLocalDate(d); })();
    const winTo   = (() => { const d = new Date(NOW); d.setDate(d.getDate() + 15); return fmtLocalDate(d); })();
    (EMAILS || []).forEach(em => {
      if (!em.fecha) return;
      if (em.fecha < winFrom || em.fecha > winTo) return;
      const k = (em.reserva || '').toLowerCase();
      if (k && seenReservas[k]) return;
      if (emailMatches(em)) return;
      seenReservas[k] = true;
      allGaps.push({
        reserva:  em.reserva, marca: em.marca, fecha: em.fecha, hora: em.hora,
        pax: em.pax, nombre: (em.nombre || '').toLowerCase(),
        email: em.email, phone: em.phone, producto: em.producto,
        total: em.total, fuente: 'Turitop-Email',
        estado: em.estado, pesos: em.pesos,
      });
    });
    const gaps = allGaps.slice().sort((a, b) => {
      const ka = (a.fecha || '') + ' ' + (a.hora || '00:00');
      const kb = (b.fecha || '') + ' ' + (b.hora || '00:00');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const gapsTomorrow = gaps.filter(g => g.fecha === TOMORROW);

    // Aggregations
    function eventsByDate(iso) { return events.filter(e => e.date === iso); }
    function paxOnDate(iso) { return eventsByDate(iso).reduce((s, e) => s + e.pax, 0); }
    function operatorBreakdown(list = events) {
      const m = new Map();
      list.forEach(e => {
        const k = e.calendar;
        if (!m.has(k)) m.set(k, { calendar: k, label: opLabel(k), color: opColor(k), events: 0, pax: 0 });
        const r = m.get(k); r.events += 1; r.pax += e.pax;
      });
      return [...m.values()].sort((a, b) => b.pax - a.pax);
    }
    function topDays(n = 12) {
      const m = new Map();
      events.forEach(e => m.set(e.date, (m.get(e.date) || 0) + e.pax));
      return [...m.entries()].map(([date, pax]) => ({ date, pax }))
        .sort((a, b) => b.pax - a.pax).slice(0, n);
    }
    function totalsByDateOp() {
      const dateMap = new Map();
      events.forEach(e => {
        if (!dateMap.has(e.date)) dateMap.set(e.date, { date: e.date, ops: {}, total: 0 });
        const r = dateMap.get(e.date);
        r.ops[e.calendar] = (r.ops[e.calendar] || 0) + e.pax;
        r.total += e.pax;
      });
      return [...dateMap.values()].sort((a, b) => a.date < b.date ? -1 : 1);
    }
    function buildAlerts() {
      const out = [];
      const tmrNoTime = events.filter(e => e.date === TOMORROW && !e.timeKnown);
      if (tmrNoTime.length) out.push({ kind: 'warn', title: `${tmrNoTime.length} vuelos de mañana sin hora de pickup`, sub: 'Confirmar horario con operadores antes del briefing', when: 'Mañana' });
      if (gapsTomorrow.length) out.push({ kind: 'bad', title: `${gapsTomorrow.length} reserva${gapsTomorrow.length>1?'s':''} sin agendar mañana`, sub: 'Pasajeros confirmados en correo/Turitop pero ausentes del calendario', when: 'Mañana' });
      const top = topDays(1)[0];
      if (top && top.pax >= 30) out.push({ kind: 'info', title: `Día pico: ${dateLabel(top.date).full}`, sub: `${top.pax} pasajeros en ${eventsByDate(top.date).length} vuelos · Considerar refuerzo de staff`, when: relativeLabel(top.date) });
      const hotelEv = events.filter(e => e.flags.hotel && e.date >= TODAY);
      if (hotelEv.length) out.push({ kind: 'info', title: `${hotelEv.length} pickups en hotel próximos`, sub: 'Coordinar transporte y horario de salida', when: '7 días' });
      return out;
    }

    // emailQueue (para vista pending: cards de mail)
    const emailQueue = (function () {
      const out = { unread: [], read: [] };
      gaps.slice(0, 10).forEach((g, i) => {
        const item = {
          id: 'mail-' + i, date: g.fecha, time: g.hora,
          subject: `${g.fuente || 'Turitop'} · Reserva ${g.reserva}`,
          from: g.email || 'no-reply@turitop.com',
          when: relativeLabel(g.fecha), source: g.fuente || 'Turitop',
          booking: g,
        };
        // Si el booking viene del email reader → ya está "abierto" (data completa)
        if (g.fuente === 'Turitop-Email') out.read.push(item);
        else if (i % 3 === 0) out.unread.push(item);
        else out.read.push(item);
      });
      return out;
    })();

    return {
      raw: RAW, gapsRaw: GAPS, emailsRaw: EMAILS || [],
      events, gaps, gapsTomorrow, emailQueue,
      NOW, TODAY, TOMORROW,
      OP_LABEL, OP_COLOR, opLabel, opColor,
      parseSummary, dateLabel, relativeLabel,
      eventsByDate, paxOnDate,
      operatorBreakdown, topDays, totalsByDateOp,
      buildAlerts,
    };
  }

  // Expongo buildState para que el RefreshModal pueda re-construir
  // el estado tras cada refresh sin reload de página.
  window.__WEFLY_BUILD__ = buildState;

  // ── Inicialización ───────────────────────────────────────────────────
  // Modo 1 (offline / preview): bootstrap inline en window.__WEFLY_DATA__
  // Modo 2 (producción): fetch live a APPS_SCRIPT_URL + TURITOP_EMAIL_READER_URL
  const inlineRaw = window.__WEFLY_DATA__;
  const inlineGaps = window.__WEFLY_GAPS__;

  if (inlineRaw && inlineGaps) {
    window.WEFLY = buildState(inlineRaw, inlineGaps, []);
    window.WEFLY._mode = 'inline';
    return;
  }

  // Fetch live — placeholder hasta que termine
  window.WEFLY = buildState({ by_date: {}, total_events: 0, generated_at: '' }, { bookings: [] }, []);
  window.WEFLY._mode = 'loading';

  // Helper: emite evento de progreso + guarda estado global para que el
  // loader pueda hidratarse incluso si monta después del primer event.
  window._weflyStepState = window._weflyStepState || {};
  function step(key, state, hint) {
    const prev = window._weflyStepState[key] || {};
    window._weflyStepState[key] = { state, hint: (hint != null ? hint : prev.hint) || '' };
    window.dispatchEvent(new CustomEvent('wefly:step', { detail: { key, state, hint } }));
  }

  // Anuncia los 4 pasos como pendientes al iniciar
  ['cal', 'mail', 'tt', 'mtch'].forEach(k => step(k, 'pending'));
  step('cal', 'active');

  // Fetch los 3 endpoints en paralelo, cada uno emite su propio evento al completar
  const ctrl = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(90000) : undefined;
  const calP = fetch(window.APPS_SCRIPT_URL + '?t=' + Date.now(), { signal: ctrl })
    .then(r => r.ok ? r.json() : null)
    .then(d => {
      const n = d?.events?.length || 0;
      step('cal', 'done', `${n} eventos`);
      step('mail', 'done', `${(d?.bookeo_emails||[]).length} Bookeo · ${(d?.viator_emails||[]).length} Viator`);
      return d;
    }).catch(err => { step('cal', 'error', err.message || 'falló'); return null; });

  step('tt', 'active');
  const gapsP = fetch('./reservas_sin_agendar.json?t=' + Date.now(), { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const emailP = fetch(window.TURITOP_EMAIL_READER_URL + '?action=turitop_emails&t=' + Date.now(), { signal: ctrl })
    .then(r => r.ok ? r.json() : null).catch(() => null);

  Promise.allSettled([calP, gapsP, emailP]).then(results => {
    const [dashRes, gapsRes, emailRes] = results.map(r => r.status === 'fulfilled' ? r.value : null);
    const ttCount = (gapsRes?.fuentes?.Turitop?.total) || 0;
    const emCount = emailRes?.emails?.length || 0;
    step('tt', 'done', `${ttCount} API · ${emCount} correos`);
    step('mtch', 'active');

    // Adaptar respuesta del Apps Script principal al formato esperado.
    // El endpoint default retorna events[] con: title_raw (summary raw),
    // name (ya parseado), pax, time, date, calendar (nombre largo: "Primary",
    // "WE FLY - BOOKEO", etc.). Hay que normalizar el calendar a código corto
    // y descartar slots de DISPONIBILIDAD.
    const CAL_CANONICAL = {
      'Primary': 'PRIMARY',
      'VGMX': 'VGMX',
      'GAT': 'GAT',
      'WE FLY - BOOKEO': 'BOOKEO',
      'VIATOR / TRIP ADVISOR': 'VIATOR',
      'GAMX-MONSE': 'GAMX_MONSE',
      'RECEPCION WE FLY': 'RECEPCION',
      'BOKUN': 'BOKUN',
      'SOLO Bokun': 'SOLO_BOKUN',
    };
    function normalizeCal(c) {
      if (!c) return 'OTHER';
      if (CAL_CANONICAL[c]) return CAL_CANONICAL[c];
      // Heurística: si contiene BOOKEO/VIATOR/GAT/VGMX en mayúscula, usar eso
      const u = c.toUpperCase();
      if (u.includes('BOOKEO')) return 'BOOKEO';
      if (u.includes('VIATOR')) return 'VIATOR';
      if (u.includes('VGMX')) return 'VGMX';
      if (u.includes('GAT')) return 'GAT';
      if (u.includes('PRIMARY') || u === 'PRIMARY') return 'PRIMARY';
      return c.toUpperCase().replace(/\s+/g, '_').replace(/\//g, '_');
    }
    function isDisponibilidad(e) {
      const n = (e.name || e.title_raw || '').toUpperCase().trim();
      if (n === 'DISPONIBILIDAD' || n === 'DISPONIBLE') return true;
      if (e.status === 'tentativo' && (e.pax || 0) === 0) return true;
      return false;
    }

    let RAW = { by_date: {}, total_events: 0, generated_at: '' };
    if (dashRes && dashRes.events) {
      RAW.generated_at = dashRes.generated_at || '';
      const m = {};
      let kept = 0;
      dashRes.events.forEach(e => {
        if (isDisponibilidad(e)) return;
        const d = e.date || (e.datetime || e.start || '').slice(0, 10);
        if (!d) return;
        if (!m[d]) m[d] = [];
        m[d].push({
          summary: e.title_raw || e.summary || e.name || '',
          time: e.time || '',
          calendar: normalizeCal(e.calendar),
          // Pasar campos extra del Apps Script para printRoute/exportCSV/Agendar
          _pax: e.pax, _name: e.name,
          _staff: e.staff || '', _pickup: e.pickup || '',
          _phone: e.phone || '', _email: e.email || '',
          _reserva: e.reserva || '', _total: e.total || '',
          _total_weight: e.total_weight || 0,
          _weights: e.weights || [], _service: e.service || '',
          _status: e.status || '',
          _celebration: !!e.celebration, _overweight: !!e.overweight,
        });
        kept++;
      });
      RAW.by_date = m;
      RAW.total_events = kept;
    }

    // Gaps: priorizar el JSON estático del repo (ya filtrado por GH Action)
    let GAPS = { bookings: [], total_sin_agendar: 0 };
    if (gapsRes && gapsRes.bookings) GAPS = gapsRes;

    // Emails: array directo del email reader
    const EMAILS = (emailRes && emailRes.emails) ? emailRes.emails : [];

    window.WEFLY = buildState(RAW, GAPS, EMAILS);
    window.WEFLY._mode = 'live';
    window.WEFLY._fetchTs = Date.now();
    const matched = (gapsRes?.fuentes?.Turitop?.matched) || 0;
    const total   = (gapsRes?.fuentes?.Turitop?.total) || 0;
    step('mtch', 'done', `${matched}/${total} matched · ${window.WEFLY.gaps.length} gaps`);
    window.dispatchEvent(new CustomEvent('wefly:loaded', { detail: window.WEFLY }));
  }).catch(err => {
    console.error('[wefly:fetch]', err);
    window.WEFLY._mode = 'error';
    window.WEFLY._error = err.message || String(err);
    step('mtch', 'error', err.message || 'falló');
    window.dispatchEvent(new CustomEvent('wefly:error', { detail: err }));
  });
})();
