/**
 * WE FLY — Dashboard API (Google Apps Script)
 * =============================================
 * Lee los 9 calendarios + Gmail (Bookeo/Viator) en VIVO
 * y devuelve JSON fresco para el dashboard.
 *
 * Deploy: script.google.com → Web App → Execute as Me → Anyone
 * Llamado desde: botón "Actualizar" en el dashboard
 */

// ── Los 9 calendarios operativos ──────────────────────
const CALENDARS = [
  {id:'weflymx@gmail.com', name:'Primary'},
  {id:'qub2vdgep4n6m3mi8fbskd4v6o@group.calendar.google.com', name:'VGMX'},
  {id:'04vo1ceehopp13f3jo75609ccc@group.calendar.google.com', name:'GAT'},
  {id:'b620fb021e2fbdb9f2febaafdecf61f27344c173e993ef103da65d31d512bcd9@group.calendar.google.com', name:'WE FLY - BOOKEO'},
  {id:'04120d78abf183c5c75470a831edb1d036fb36578b33e0686484c9bdfafeca3c@group.calendar.google.com', name:'VIATOR / TRIP ADVISOR'},
  {id:'d211825528abd3521fc05f4fc97cabba7c453950d8b2a594928e525eb25274db@group.calendar.google.com', name:'GAMX-MONSE'},
  {id:'af1a94e84b941b31d2fbfd29211680e3abfd6f40eeaa3c156984ea7450d8c9db@group.calendar.google.com', name:'RECEPCION WE FLY'},
  {id:'e38f5b153e348cd448adadaaf4cf2ca53387927690c0c1f270649e9c3389b7d5@group.calendar.google.com', name:'BOKUN'},
  {id:'38cf928629e509ec7fa650f2cb140f60a54cbaeb3b9bbc65dc8a6541509d6180@group.calendar.google.com', name:'SOLO Bokun'},
];

const TZ = 'America/Mexico_City';

// ── Entry point (Web App GET) ─────────────────────────
// Rutas:
//   (default)                  → dashboard completo (events + emails + stats)
//   ?action=events_flat        → formato para gap_detector.py (array plano)
//   &from=YYYY-MM-DD&to=...    → ventana custom (default: hoy-7d .. hoy+30d)
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (action === 'events_flat') {
      const from = (e.parameter.from) ? parseDate(e.parameter.from) : addDays(new Date(), -7);
      const to   = (e.parameter.to)   ? parseDate(e.parameter.to)   : addDays(new Date(), 30);
      const flat = buildFlatEvents(from, to);
      return jsonOut(flat);
    }
    if (action === 'gaps_flat') {
      // Sistema completo de gap detection en Apps Script (no requiere GitHub Actions)
      const from = (e.parameter.from) ? e.parameter.from : fmt(addDays(new Date(), -1));
      const to   = (e.parameter.to)   ? e.parameter.to   : fmt(addDays(new Date(), 15));
      return jsonOut(buildGapsFlat(from, to));
    }
    if (action === 'turitop') {
      // Solo Turitop, útil para debug
      const from = (e.parameter.from) ? e.parameter.from : fmt(addDays(new Date(), -1));
      const to   = (e.parameter.to)   ? e.parameter.to   : fmt(addDays(new Date(), 30));
      return jsonOut(fetchAllTuritop(from, to));
    }
    const data = buildDashboardData();
    return jsonOut(data);
  } catch(err) {
    return jsonOut({ error: err.message, stack: err.stack });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Devuelve eventos en el formato que consume gap_detector.py:
// [{ date, summary, desc, calendar, emails, phones }]
// - calendar: nombre canónico (PRIMARY, GAT, VGMX, BOOKEO, VIATOR, GAMX_MONSE, RECEPCION, BOKUN, SOLO_BOKUN)
// - emails/phones: PRE-EXTRAÍDOS del desc completo (anti-truncate)
function buildFlatEvents(start, end) {
  const CANONICAL = {
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
  const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const PHONE_RE = /[\d][\d\s().+\-]{7,}\d/g;
  const last10 = s => {
    const d = (s || '').replace(/\D/g, '');
    return d.length >= 10 ? d.slice(-10) : d;
  };
  const out = [];
  for (const cal of CALENDARS) {
    try {
      const c = CalendarApp.getCalendarById(cal.id);
      if (!c) continue;
      const evts = c.getEvents(start, end);
      for (const ev of evts) {
        const title = ev.getTitle() || '';
        // Skip DISPONIBILIDAD / DISPONIBLE y all-day slots genéricos
        if (/^\s*(disponibilidad|disponible)\s*$/i.test(title)) continue;
        const descRaw = ev.getDescription() || '';
        const desc = descRaw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const startT = ev.getStartTime();
        const dateStr = Utilities.formatDate(startT, TZ, 'yyyy-MM-dd');
        const text = (title + ' ' + desc);
        const emails = Array.from(new Set((text.toLowerCase().match(EMAIL_RE) || [])));
        const phonesSet = {};
        const phoneMatches = text.match(PHONE_RE) || [];
        for (const p of phoneMatches) {
          const k = last10(p);
          if (k) phonesSet[k] = true;
        }
        out.push({
          date: dateStr,
          summary: title,
          desc: desc,  // SIN truncar
          calendar: CANONICAL[cal.name] || cal.name.toUpperCase().replace(/\s+/g, '_').replace(/\//g, '_'),
          emails: emails,
          phones: Object.keys(phonesSet),
        });
      }
    } catch(e) {
      Logger.log('Calendar error ' + cal.name + ': ' + e.message);
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function parseDate(s) {
  // "YYYY-MM-DD" → Date local
  const m = (s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}
function addDays(d, n) {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

// ── Orchestrator ──────────────────────────────────────
function buildDashboardData() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today.getTime() + 30*24*60*60*1000); // 30 días para cubrir todos los vuelos
  const todayStr = fmt(today);

  // 1 — Calendar events
  const events = fetchAllCalendarEvents(today, end);

  // 2 — Gmail: Bookeo + Viator emails (últimos 14 días)
  const bookeoEmails = fetchBookeoEmails();
  const viatorEmails = fetchViatorEmails();

  // 3 — Match emails contra calendario
  const pendingBookeo = matchToCalendar(bookeoEmails, events, 'bookeo');
  const pendingViator = matchToCalendar(viatorEmails, events, 'viator');

  // 4 — Stats
  const stats = buildStats(events, pendingBookeo, pendingViator);
  const totalsByDay = buildTotalsByDay(events);

  return {
    events,
    bookeo_emails: bookeoEmails,
    viator_emails: viatorEmails,
    pending_bookeo: pendingBookeo,
    pending_viator: pendingViator,
    stats,
    totals_by_day: totalsByDay,
    generated_at: now.toISOString(),
    missing_bookeo: pendingBookeo.filter(x => !x.in_calendar),
    missing_viator: pendingViator.filter(x => !x.in_calendar),
  };
}

// ══════════════════════════════════════════════════════
// 1. CALENDAR EVENTS
// ══════════════════════════════════════════════════════

function fetchAllCalendarEvents(start, end) {
  const all = [];
  for (const cal of CALENDARS) {
    try {
      const c = CalendarApp.getCalendarById(cal.id);
      if (!c) continue;
      const evts = c.getEvents(start, end);
      for (const ev of evts) {
        all.push(parseCalendarEvent(ev, cal.name));
      }
    } catch(e) {
      Logger.log('Calendar error ' + cal.name + ': ' + e.message);
    }
  }
  all.sort((a,b) => a.datetime.localeCompare(b.datetime));
  return all;
}

function parseCalendarEvent(ev, calName) {
  const title = ev.getTitle() || '';
  const descRaw = ev.getDescription() || '';
  const desc = descRaw.replace(/<[^>]*>/g, ' '); // strip HTML tags for parsing
  const start = ev.getStartTime();
  const dateStr = fmt(start);
  const timeStr = Utilities.formatDate(start, TZ, 'HH:mm');

  // Parse title: "✅ *2P Juan Carlos García" or "⚡ *4P Nombre"
  let status = 'tentativo';
  if (title.includes('✅')) status = 'confirmado';
  else if (title.includes('🔄') || title.includes('✏')) status = 'modificado';
  else if (title.includes('❌')) status = 'cancelado';

  let pax = 0;
  // Tolera ambos formatos del calendario:
  //   con asterisco:    "✅.*2P Juan", "*6p Vivian Roses"
  //   sin asterisco:    "2P Regina Cruz", "3P Jose Refugio Barajas"
  const paxM = title.match(/\b\*?(\d+)p\b/i);
  if (paxM) pax = parseInt(paxM[1]);

  // Name: everything after the pax marker
  let name = title.replace(/^[^\w]*/, '').replace(/\*?\d+P\s*/i, '').trim();
  // Remove leading emoji/status chars
  name = name.replace(/^[✅⚡🔄✏❌🟡🔵⭐️\s*]+/, '').trim();
  if (!name) name = title;

  // Parse description fields
  const email = extractField(desc, /(?:📧|email|correo)[:\s]*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i)
    || extractEmail(desc);
  const phone = extractField(desc, /(?:📱|tel|phone|whatsapp|celular)[:\s]*([\d+\s().,-]{7,20})/i) || '';
  const reserva = extractField(desc, /(?:reserva|booking|ref|id)[:\s#]*([A-Z0-9\-]{5,})/i) || ev.getId();
  const pickup = extractField(desc, /(?:🏨|hotel|pickup|recolección|dirección)[:\s]*(.*)/i) || '';
  const staff = extractField(desc, /(?:staff|piloto|guía|operador)[:\s]*(.*)/i) || '';
  const total = extractField(desc, /(?:total|precio|monto)[:\s$]*([\d,.$]+)/i) || '';

  // Weights
  const weights = [];
  const weightMatches = desc.match(/(\d{2,3})\s*kg/gi);
  if (weightMatches) {
    for (const w of weightMatches) {
      const n = parseInt(w);
      if (n >= 20 && n <= 200) weights.push(n);
    }
  }

  // Service / includes
  let service = extractField(desc, /(?:servicio|experiencia|paquete|producto)[:\s]*(.*)/i) || '';
  const includes = [];
  if (/cueva/i.test(desc) || /cueva/i.test(title)) includes.push('Cueva');
  if (/desayuno/i.test(desc)) includes.push('Desayuno');
  if (/pirámide/i.test(desc) || /piramide/i.test(desc)) includes.push('Pirámides');
  if (/transporte/i.test(desc)) includes.push('Transporte');
  if (/foto/i.test(desc)) includes.push('Fotos');
  if (/video/i.test(desc)) includes.push('Video');

  const totalWeight = weights.reduce((a,b) => a+b, 0);

  return {
    calendar: calName,
    id: ev.getId(),
    title_raw: title,
    name,
    datetime: dateStr + 'T' + timeStr,
    date: dateStr,
    time: timeStr,
    status,
    pax,
    weights,
    total_weight: totalWeight,
    service,
    includes,
    phone,
    email,
    reserva,
    total,
    pickup,
    staff,
    html_link: '', // Apps Script doesn't expose this easily
    overweight: weights.some(w => w > 95),
    celebration: /cumple|aniversario|birthday|boda|honeymoon|luna de miel/i.test(title + ' ' + desc),
  };
}

// ══════════════════════════════════════════════════════
// 2. GMAIL — BOOKEO EMAILS
// ══════════════════════════════════════════════════════

function fetchBookeoEmails() {
  const results = [];
  try {
    // Search Bookeo confirmation emails from last 14 days
    const threads = GmailApp.search('(from:bookeo OR subject:bookeo) newer_than:14d', 0, 80);
    for (const thread of threads) {
      const msgs = thread.getMessages();
      for (const msg of msgs) {
        const parsed = parseBookeoEmail(msg);
        if (parsed) results.push(parsed);
      }
    }
  } catch(e) {
    Logger.log('Bookeo Gmail error: ' + e.message);
  }
  // Dedupe by name+flight_date
  const seen = new Set();
  return results.filter(r => {
    const key = (r.name||'') + '|' + (r.flight_date||'');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseBookeoEmail(msg) {
  const subject = msg.getSubject() || '';
  const body = msg.getPlainBody() || '';
  const html = msg.getBody() || '';
  const received = msg.getDate();

  // Extract name from subject: "Nueva reserva - Ana Isabel Orrego" or "Reserva de Jessica Johnson"
  const nameM = subject.match(/reserva\s*-\s*(.+)/i) || subject.match(/reserva\s+de\s+(.+)/i) || subject.match(/booking\s+(?:from|by)\s+(.+)/i);
  const name = nameM ? nameM[1].trim() : '';
  if (!name) return null;

  // Extract flight date - look for patterns like "viernes, 17 abril 2026" or "Friday, April 17, 2026"
  let flightDate = '';
  let flightDateRaw = '';

  // Spanish date patterns
  const esDateM = body.match(/(?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)[,\s]+(\d{1,2})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/i);
  if (esDateM) {
    flightDateRaw = esDateM[0];
    const months = {enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',
      julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    const m = months[esDateM[2].toLowerCase()];
    if (m) flightDate = `${esDateM[3]}-${m}-${esDateM[1].padStart(2,'0')}`;
  }

  // ISO date fallback
  if (!flightDate) {
    const isoM = body.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoM) flightDate = isoM[1];
  }

  // Extract hour
  const hourM = body.match(/(\d{1,2}:\d{2})\s*(?:am|pm|hrs|h)?/i);
  const hour = hourM ? hourM[1] : '';

  // Extract experience/product
  const expM = body.match(/(?:experiencia|experience|producto|product|actividad)[:\s]*([^\n]{3,60})/i);
  const experience = expM ? expM[1].trim() : '';

  // Extract pax
  const paxM = body.match(/(\d+)\s*(?:adulto|adult|persona|person|pax|participante)/i);
  const pax = paxM ? paxM[0] : '1';

  // Extract price
  const priceM = body.match(/(?:total|precio|price|monto)[:\s]*\$?\s*([\d,]+\.?\d*)\s*(MXN|USD|mxn|usd)?/i);
  const price = priceM ? `${priceM[1]} ${(priceM[2]||'MXN').toUpperCase()}` : '';

  return {
    name,
    flight_date_raw: flightDateRaw,
    flight_date: flightDate,
    hour,
    experience,
    pax,
    price,
    received: Utilities.formatDate(received, TZ, "EEE, d MMM yyyy, h:mm a"),
    unread: msg.isUnread(),
    source: 'bookeo',
  };
}

// ══════════════════════════════════════════════════════
// 3. GMAIL — VIATOR EMAILS
// ══════════════════════════════════════════════════════

function fetchViatorEmails() {
  const results = [];
  try {
    const threads = GmailApp.search('(from:viator OR subject:viator) newer_than:14d', 0, 80);
    for (const thread of threads) {
      const msgs = thread.getMessages();
      for (const msg of msgs) {
        const parsed = parseViatorEmail(msg);
        if (parsed) results.push(parsed);
      }
    }
  } catch(e) {
    Logger.log('Viator Gmail error: ' + e.message);
  }
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.ref)) return false;
    seen.add(r.ref);
    return true;
  });
}

function parseViatorEmail(msg) {
  const subject = msg.getSubject() || '';
  const body = msg.getPlainBody() || '';
  const received = msg.getDate();

  // Extract booking reference: BR-XXXXXXXXXX (can be in subject or body)
  // Subject example: "Nueva reserva para el Wed, May 06, 2026 (#BR-1383338383)"
  const allText = subject + ' ' + body;
  const refM = allText.match(/BR-\d{7,}/);
  const ref = refM ? refM[0] : '';
  if (!ref) return null;

  // Flight date: "Wed, May 06, 2026" or "Sat, Apr 11, 2026"
  let flightDate = '';
  let flightDateRaw = '';

  const enDateM = allText.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})[,\s]+(\d{4})/i);
  if (enDateM) {
    flightDateRaw = enDateM[0];
    const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
      jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const m = months[enDateM[2].toLowerCase()];
    if (m) flightDate = `${enDateM[4]}-${m}-${enDateM[3].padStart(2,'0')}`;
  }

  if (!flightDate) {
    const isoM = body.match(/(\d{4}-\d{2}-\d{2})/);
    if (isoM) flightDate = isoM[1];
  }

  // Status
  let status = 'nueva';
  if (/cancel/i.test(subject)) status = 'cancelada';
  else if (/modif|amend|change/i.test(subject)) status = 'modificada';

  return {
    ref,
    flight_date_raw: flightDateRaw,
    flight_date: flightDate,
    received: Utilities.formatDate(received, TZ, "EEE, d MMM yyyy, h:mm a"),
    status,
    unread: msg.isUnread(),
    source: 'viator',
  };
}

// ══════════════════════════════════════════════════════
// 4. MATCHING — emails ↔ calendario
// ══════════════════════════════════════════════════════

function matchToCalendar(emails, events, source) {
  return emails.map(em => {
    const date = em.flight_date;
    const dayEvents = events.filter(e => e.date === date);
    let matched = false;
    let matchId = '';
    let matchName = '';

    // Buscar por nombre
    const searchName = (source === 'bookeo') ? (em.name || '') : (em.ref || '');
    const nameTokens = tokenize(searchName);

    for (const ev of dayEvents) {
      const evText = (ev.title_raw + ' ' + ev.email + ' ' + ev.phone + ' ' + ev.name + ' ' + ev.reserva).toLowerCase();

      // Match by reference (Viator)
      if (source === 'viator' && em.ref && evText.includes(em.ref.toLowerCase())) {
        matched = true; matchId = ev.id; matchName = ev.name; break;
      }

      // Match by name tokens (2+ tokens match)
      if (nameTokens.length > 0) {
        const evTokens = tokenize(ev.title_raw + ' ' + ev.name);
        const overlap = nameTokens.filter(t => evTokens.includes(t));
        if (overlap.length >= 2 || (overlap.length >= 1 && overlap[0].length >= 6)) {
          matched = true; matchId = ev.id; matchName = ev.name; break;
        }
      }

      // Match by email
      if (source === 'bookeo' && em.name) {
        const emailLower = (em.name || '').toLowerCase();
        // Some Bookeo emails include the client email in description
        if (ev.email && ev.email.toLowerCase().includes(emailLower.split(' ')[0])) {
          // Weak match, skip
        }
      }
    }

    return {
      ...em,
      in_calendar: matched,
      calendar_event_id: matchId,
      calendar_name: matchName,
    };
  });
}

// ══════════════════════════════════════════════════════
// 5. STATS
// ══════════════════════════════════════════════════════

function buildStats(events, pendingBookeo, pendingViator) {
  const byCalendar = {};
  const byStatus = {};
  const byDate = {};
  let totalPax = 0;
  let dateMin = '9999', dateMax = '0000';

  for (const ev of events) {
    byCalendar[ev.calendar] = (byCalendar[ev.calendar] || 0) + 1;
    byStatus[ev.status] = (byStatus[ev.status] || 0) + 1;
    totalPax += ev.pax || 0;
    if (ev.date < dateMin) dateMin = ev.date;
    if (ev.date > dateMax) dateMax = ev.date;

    if (!byDate[ev.date]) byDate[ev.date] = {events:0, pax:0};
    byDate[ev.date].events++;
    byDate[ev.date].pax += ev.pax || 0;
  }

  return {
    total_events: events.length,
    total_pax: totalPax,
    by_calendar: byCalendar,
    by_status: byStatus,
    by_date: byDate,
    date_min: dateMin === '9999' ? '' : dateMin,
    date_max: dateMax === '0000' ? '' : dateMax,
    pending_bookeo_count: pendingBookeo.length,
    pending_bookeo_unread: pendingBookeo.filter(x => x.unread).length,
    pending_bookeo_missing: pendingBookeo.filter(x => !x.in_calendar).length,
    pending_viator_count: pendingViator.length,
    pending_viator_missing: pendingViator.filter(x => !x.in_calendar).length,
    weight_limit_kg: 95,
  };
}

function buildTotalsByDay(events) {
  const byDay = {};
  for (const ev of events) {
    if (!byDay[ev.date]) byDay[ev.date] = {events:0, pax:0, weight:0};
    byDay[ev.date].events++;
    byDay[ev.date].pax += ev.pax || 0;
    byDay[ev.date].weight += ev.total_weight || 0;
  }
  return byDay;
}

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════

function fmt(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
}

function extractField(text, regex) {
  const m = text.match(regex);
  return m ? m[1].trim() : '';
}

function extractEmail(text) {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : '';
}

const STOP_WORDS = new Set([
  'de','la','el','los','las','del','van','di','da','jr','sr','mc','mac','dr','med',
  'reserva','abonada','vuelo','globo','compartido','privado','teotihuacan'
]);

function tokenize(str) {
  if (!str) return [];
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .match(/[a-z]{3,}/g)
    ?.filter(t => !STOP_WORDS.has(t)) || [];
}

// ══════════════════════════════════════════════════════
// TURITOP API CLIENT  (OAuth2 + chunking bisección)
// Credenciales en PropertiesService → NO en el código
// Correr turitopSetup() UNA VEZ para configurarlas.
// ══════════════════════════════════════════════════════

const TURITOP_BASE = 'https://app.turitop.com/v1';

function turitopSetup() {
  // ⚠️ Correr esto UNA VEZ desde el editor de Apps Script.
  // Después BORRAR los valores de este file y re-deploy.
  // Los valores quedan cifrados en Script Properties.
  PropertiesService.getScriptProperties().setProperties({
    M1_SHORT_ID:   'G465',
    M1_SECRET_KEY: 'b67MC9U2k1GaBe8Rl2fuloUx1250MGPo',
    M2_SHORT_ID:   'V212',
    M2_SECRET_KEY: 'iVvdGOT5AhG83UHaZY3gWNhNfIrmUu6h',
  });
  Logger.log('✅ Turitop credentials guardadas en Script Properties');
}

// Shape correcta validada contra wefly_turitop_client.py (que SÍ funciona en prod)
function turitopAuth(shortId, secretKey) {
  const res = UrlFetchApp.fetch(TURITOP_BASE + '/authorization/grant', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ short_id: shortId, secret_key: secretKey }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) throw new Error('Turitop auth ' + shortId + ' HTTP ' + code + ': ' + body.slice(0, 200));
  const parsed = JSON.parse(body);
  // Turitop devuelve access_token dentro de `data`
  const token = (parsed.data && parsed.data.access_token) || parsed.access_token;
  if (!token) throw new Error('Turitop auth ' + shortId + ': respuesta sin access_token: ' + body.slice(0, 200));
  return token;
}

function turitopGetBookings(accessToken, dateFromStr, dateToStr) {
  // Turitop requiere UNIX timestamps (UTC seconds).
  function dateToUnix(dStr) {
    return Math.floor(parseDate(dStr).getTime() / 1000);
  }
  const all = [];
  const seen = {};
  function fetchChunk(fromStr, toStr) {
    const res = UrlFetchApp.fetch(TURITOP_BASE + '/booking/getbookings', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        access_token: accessToken,
        data: {
          filter: {
            bookings_date_from: dateToUnix(fromStr),
            bookings_date_to:   dateToUnix(toStr),
            show_deleted: 0,
          }
        }
      }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code !== 200) throw new Error('Turitop bookings HTTP ' + code + ' [' + fromStr + '..' + toStr + ']: ' + body.slice(0, 300));
    const parsed = JSON.parse(body);
    const bookings = (parsed.data && parsed.data.bookings) || parsed.bookings || [];
    if (bookings.length >= 100) {
      const mid = midDateStr(fromStr, toStr);
      if (mid === fromStr || mid === toStr) {
        // No se puede dividir más
        for (const b of bookings) {
          const sid = b.short_id;
          if (sid && !seen[sid]) { seen[sid] = 1; all.push(b); }
        }
      } else {
        fetchChunk(fromStr, mid);
        fetchChunk(addDaysStr(mid, 1), toStr);
      }
    } else {
      for (const b of bookings) {
        const sid = b.short_id;
        if (sid && !seen[sid]) { seen[sid] = 1; all.push(b); }
      }
    }
  }
  fetchChunk(dateFromStr, dateToStr);
  return all;
}

function normalizeTuritopBooking(b, marca) {
  // Shape real Turitop (del Python normalize):
  //   short_id, product_name, date_event_iso8601 ("2026-04-08T06:00:00-0600"),
  //   client_data: {name, email, phone, ...},
  //   ticket_type_count: [{name, count}, ...]  → pax = sum counts,
  //   archived (boolean).
  const cd = b.client_data || {};
  const tc = b.ticket_type_count || [];
  let pax = 0;
  for (const t of tc) pax += parseInt(t.count || 0) || 0;
  if (pax === 0) pax = b.pax || 0;
  const dateEvent = b.date_event_iso8601 || '';
  return {
    reserva:  b.short_id || '',
    marca:    marca,
    fecha:    dateEvent.slice(0, 10),
    hora:     dateEvent.length >= 16 ? dateEvent.slice(11, 16) : '',
    pax:      pax,
    nombre:   (cd.name || '').toLowerCase(),
    email:    (cd.email || '').toLowerCase(),
    phone:    cd.phone || '',
    producto: b.product_name || '',
    total:    b.total_price || '',
    archivada: !!b.archived,
  };
}

function fetchAllTuritop(dateFromStr, dateToStr) {
  const props = PropertiesService.getScriptProperties();
  const marcas = [
    { slot: 'M1', shortId: props.getProperty('M1_SHORT_ID'), secret: props.getProperty('M1_SECRET_KEY') },
    { slot: 'M2', shortId: props.getProperty('M2_SHORT_ID'), secret: props.getProperty('M2_SECRET_KEY') },
  ];
  // Turitop filtra por fecha de creación, no de evento.
  // Abrir ventana amplia y filtrar client-side.
  const creationFrom = addDaysStr(dateFromStr, -365);
  const creationTo   = addDaysStr(dateToStr, 7);

  const all = [];
  const errors = [];
  for (const m of marcas) {
    if (!m.shortId || !m.secret) {
      errors.push(m.slot + ': credenciales no configuradas (correr turitopSetup)');
      continue;
    }
    try {
      const token = turitopAuth(m.shortId, m.secret);
      const raw = turitopGetBookings(token, creationFrom, creationTo);
      for (const b of raw) {
        const n = normalizeTuritopBooking(b, m.slot);
        if (n.archivada) continue;
        if (!n.fecha) continue;
        if (n.fecha < dateFromStr || n.fecha > dateToStr) continue;
        all.push(n);
      }
    } catch (e) {
      errors.push(m.slot + ': ' + e.message);
      Logger.log('Turitop ' + m.slot + ' error: ' + e.message);
    }
  }
  return { bookings: all, errors: errors };
}

// ══════════════════════════════════════════════════════
// GAP DETECTOR en Apps Script
// ══════════════════════════════════════════════════════

function buildGapsFlat(dateFromStr, dateToStr) {
  const generated = new Date().toISOString();

  // 1) Calendarios (flat con emails/phones pre-extraídos)
  const start = parseDate(addDaysStr(dateFromStr, -1));
  const end   = parseDate(addDaysStr(dateToStr, 1));
  end.setHours(23, 59, 59);
  const flatEvents = buildFlatEvents(start, end);

  // 2) Turitop live
  const turitopResult = fetchAllTuritop(dateFromStr, dateToStr);
  const turitopBookings = turitopResult.bookings;

  // 3) Bookeo vía Gmail
  const bookeoEmails = fetchBookeoEmails();
  const bookeoInWindow = bookeoEmails.filter(b =>
    b.flight_date && b.flight_date >= dateFromStr && b.flight_date <= dateToStr
  );

  // 4) Index de calendario
  const calIndex = buildGapCalIndex(flatEvents);

  // 5) Matching
  const turUnmatched = [], bkUnmatched = [];
  let turMatched = 0, bkMatched = 0;

  for (const b of turitopBookings) {
    if (matchTuritopAS(b, calIndex, 1)) turMatched++;
    else turUnmatched.push(b);
  }
  for (const em of bookeoInWindow) {
    if (matchBookeoAS(em, calIndex, 1)) bkMatched++;
    else bkUnmatched.push(em);
  }

  // 6) Output unificado
  const allUnmatched = [];
  for (const b of turUnmatched) {
    allUnmatched.push(Object.assign({}, b, { fuente: 'Turitop' }));
  }
  bkUnmatched.forEach((b, i) => {
    allUnmatched.push({
      reserva:  'BK-' + String(i + 1).padStart(3, '0'),
      marca:    'BK',
      fecha:    b.flight_date,
      hora:     b.hour || '',
      pax:      b.pax,
      nombre:   b.name,
      email:    '',
      phone:    '',
      producto: b.experience,
      total:    b.price,
      fuente:   'Bookeo',
    });
  });
  allUnmatched.sort((a, b) =>
    ((a.fecha || '') + (a.hora || '') + (a.nombre || '')).localeCompare(
     (b.fecha || '') + (b.hora || '') + (b.nombre || ''))
  );

  return {
    generated_at: generated,
    window: dateFromStr + ' → ' + dateToStr,
    slack_days: 1,
    source: 'apps_script_live',
    errors: turitopResult.errors,
    fuentes: {
      Turitop: { total: turitopBookings.length, matched: turMatched, sin_agendar: turUnmatched.length },
      Bookeo:  { total: bookeoInWindow.length,  matched: bkMatched,  sin_agendar: bkUnmatched.length },
    },
    total_fuentes: turitopBookings.length + bookeoInWindow.length,
    total_sin_agendar: allUnmatched.length,
    bookings: allUnmatched,
  };
}

function buildGapCalIndex(flatEvents) {
  const idx = {};
  for (const ev of flatEvents) {
    const d = ev.date;
    const txt = ((ev.summary || '') + ' ' + (ev.desc || '')).toLowerCase();
    const emails = new Set((ev.emails || []).map(e => e.toLowerCase()));
    const phones = new Set(ev.phones || []);
    const toks = new Set(tokenize((ev.summary || '') + ' ' + (ev.desc || '').replace(/[^\w\s@]/g, ' ')));
    const fullDigits = txt.replace(/\D/g, '');
    if (!idx[d]) idx[d] = [];
    idx[d].push({
      sum: ev.summary,
      cal: ev.calendar,
      emails: emails, phones: phones, tokens: toks,
      fullText: txt,
      fullDigits: fullDigits,
    });
  }
  return idx;
}

function eventsAround(calIndex, dateStr, slack) {
  const out = [];
  const d0 = parseDate(dateStr);
  for (let delta = -slack; delta <= slack; delta++) {
    const dd = fmt(addDays(d0, delta));
    if (calIndex[dd]) out.push.apply(out, calIndex[dd]);
  }
  return out;
}

function last10AS(phone) {
  const d = (phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

function matchTuritopAS(b, calIndex, slack) {
  const evs = eventsAround(calIndex, b.fecha || '', slack);
  const em = (b.email || '').toLowerCase().trim();
  const ph = last10AS(b.phone);
  const nmToks = new Set(tokenize(b.nombre || ''));
  const rid = (b.reserva || '').toLowerCase();
  const ridDigits = rid.replace(/\D/g, '');
  const ridShort = ridDigits.length >= 9 ? ridDigits.slice(0, 9) : ridDigits;

  for (const ev of evs) {
    if (rid && ev.fullText.indexOf(rid) !== -1) return { strategy: 'reserva_id', cal: ev.cal };
    if (ridShort && ev.fullDigits.indexOf(ridShort) !== -1) return { strategy: 'reserva_id_digits', cal: ev.cal };
    if (em && ev.emails.has(em)) return { strategy: 'email', cal: ev.cal };
    if (ph && ev.phones.has(ph)) return { strategy: 'phone', cal: ev.cal };
    if (nmToks.size) {
      const overlap = [];
      nmToks.forEach(t => { if (ev.tokens.has(t)) overlap.push(t); });
      if (overlap.length >= 2) return { strategy: 'name2', cal: ev.cal };
      const rare = overlap.filter(t => t.length >= 6);
      if (rare.length) return { strategy: 'name1rare', cal: ev.cal };
    }
  }
  return null;
}

function matchBookeoAS(emObj, calIndex, slack) {
  const evs = eventsAround(calIndex, emObj.flight_date, slack);
  const nmToks = new Set(tokenize((emObj.name || '').replace(/^reserva\s+abonada\s*-\s*/i, '')));
  for (const ev of evs) {
    if (nmToks.size) {
      const overlap = [];
      nmToks.forEach(t => { if (ev.tokens.has(t)) overlap.push(t); });
      if (overlap.length >= 2) return { strategy: 'name2', cal: ev.cal };
      const rare = overlap.filter(t => t.length >= 6);
      if (rare.length) return { strategy: 'name1rare', cal: ev.cal };
    }
  }
  return null;
}

function midDateStr(fromStr, toStr) {
  const a = parseDate(fromStr).getTime();
  const b = parseDate(toStr).getTime();
  return fmt(new Date(Math.floor((a + b) / 2)));
}
function addDaysStr(dateStr, n) {
  return fmt(addDays(parseDate(dateStr), n));
}

// ══════════════════════════════════════════════════════
// WRITE API — Crear eventos desde el dashboard (🤖 bot)
// ══════════════════════════════════════════════════════

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: 'no_body' });
    }
    const body = JSON.parse(e.postData.contents);

    // Auth
    const token = PropertiesService.getScriptProperties().getProperty('WRITE_TOKEN');
    if (!token) return jsonOut({ ok: false, error: 'write_token_not_configured' });
    if (body.token !== token) return jsonOut({ ok: false, error: 'unauthorized' });

    if (body.action === 'create_event') {
      return jsonOut(createEventFromBooking(body.booking, body.dry_run === true));
    }
    if (body.action === 'ping') {
      return jsonOut({ ok: true, pong: true, now: new Date().toISOString() });
    }
    return jsonOut({ ok: false, error: 'unknown_action', action: body.action });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message, stack: err.stack });
  }
}

function writeTokenSetup() {
  // Correr UNA VEZ desde el editor. Genera WRITE_TOKEN random y lo guarda.
  // El token aparece en los logs — cópialo a mobile.html.
  const tok = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('WRITE_TOKEN', tok);
  Logger.log('✅ WRITE_TOKEN generado. COPIA ESTO a mobile.html:');
  Logger.log(tok);
  return tok;
}

function writeTokenGet() {
  // Devuelve el token actual (útil si se te olvida).
  const t = PropertiesService.getScriptProperties().getProperty('WRITE_TOKEN');
  Logger.log('Current WRITE_TOKEN: ' + (t || '(no configurado — correr writeTokenSetup)'));
  return t;
}

function createEventFromBooking(b, dryRun) {
  if (!b) return { ok: false, error: 'no_booking' };

  // Map marca → calendar
  const calMap = {
    M1: '04vo1ceehopp13f3jo75609ccc@group.calendar.google.com',  // GAT
    M2: 'qub2vdgep4n6m3mi8fbskd4v6o@group.calendar.google.com',   // VGMX
    BK: 'b620fb021e2fbdb9f2febaafdecf61f27344c173e993ef103da65d31d512bcd9@group.calendar.google.com',  // BOOKEO
  };
  const marca = (b.marca || '').toUpperCase();
  const calId = calMap[marca] || calMap.BK;
  const cal = CalendarApp.getCalendarById(calId);
  if (!cal) return { ok: false, error: 'calendar_not_found', marca: marca, calId: calId };

  // Parse date + time
  const dateM = (b.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateM) return { ok: false, error: 'invalid_date', fecha: b.fecha };
  const timeStr = (b.hora || '06:00').toString();
  const timeM = timeStr.match(/^(\d{1,2}):(\d{2})/);
  const hh = timeM ? Math.min(23, Math.max(0, parseInt(timeM[1]))) : 6;
  const mm = timeM ? Math.min(59, Math.max(0, parseInt(timeM[2]))) : 0;
  const start = new Date(parseInt(dateM[1]), parseInt(dateM[2]) - 1, parseInt(dateM[3]), hh, mm);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);  // 3h default

  // Capitalize nombre
  const rawName = (b.nombre || 'Sin nombre').trim().replace(/\s+/g, ' ');
  const nameNice = rawName.replace(/\b(\p{L})(\p{L}*)/gu, (m, f, r) => f.toUpperCase() + r.toLowerCase());

  // Pax
  const paxNum = parseInt(b.pax) || 1;

  // Title — 🤖 marca que fue agendado por el sistema
  const title = '🤖 *' + paxNum + 'P ' + nameNice;

  // Description en formato consistente con el resto de eventos
  const lines = [];
  lines.push('Fecha de compra: (reserva previa del sistema)');
  lines.push('No.Reserva: ' + (b.reserva || ''));
  lines.push('Nombre: ' + nameNice);
  lines.push('Fecha de Vuelo: ' + (b.fecha || '') + (b.hora ? ' ' + b.hora : ''));
  lines.push('Tipo de Servicio: ' + (b.producto || ''));
  lines.push('Participantes: ' + paxNum + ' pax');
  if (b.email) lines.push('Email: ' + b.email);
  if (b.phone) lines.push('Tel: ' + b.phone);
  if (b.total)  lines.push('Total: ' + b.total);
  lines.push('');
  lines.push('🤖 Agendado por WE FLY Gap Detector');
  lines.push('Fuente: ' + (b.fuente || marca));
  lines.push('Generado: ' + new Date().toISOString());

  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      would_create: {
        calendar: calId,
        calendar_name: cal.getName(),
        title: title,
        start: start.toISOString(),
        end: end.toISOString(),
        description: lines.join('\n'),
      },
    };
  }

  const ev = cal.createEvent(title, start, end, {
    description: lines.join('\n'),
  });

  return {
    ok: true,
    event_id: ev.getId(),
    calendar: calId,
    calendar_name: cal.getName(),
    title: title,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

// ══════════════════════════════════════════════════════
// Test helpers (correr desde editor script.google.com)
// ══════════════════════════════════════════════════════
function testCreateEventDryRun() {
  // Prueba sin crear realmente el evento
  const result = createEventFromBooking({
    reserva: 'TEST-260419-1',
    marca: 'M1',
    fecha: '2026-04-25',
    hora: '06:00',
    pax: 2,
    nombre: 'juan perez test',
    email: 'test@example.com',
    phone: '+525512345678',
    producto: 'Vuelo Tradicional en Teotihuacán',
    total: '5000',
    fuente: 'Turitop',
  }, true);
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function testBuild() {
  const data = buildDashboardData();
  Logger.log('Events: ' + data.events.length);
  Logger.log('Bookeo emails: ' + data.bookeo_emails.length);
  Logger.log('Viator emails: ' + data.viator_emails.length);
  Logger.log('Pending Bookeo not in cal: ' + data.missing_bookeo.length);
  Logger.log('Pending Viator not in cal: ' + data.missing_viator.length);
  Logger.log(JSON.stringify(data).length + ' bytes');
}

function testTuritop() {
  const today = fmt(new Date());
  const end   = fmt(addDays(new Date(), 15));
  const r = fetchAllTuritop(today, end);
  Logger.log('Turitop ' + today + '..' + end + ': ' + r.bookings.length + ' bookings');
  if (r.errors.length) Logger.log('Errores: ' + r.errors.join(' | '));
  if (r.bookings[0]) Logger.log('Primero: ' + JSON.stringify(r.bookings[0]));
}

function testGaps() {
  const today = fmt(new Date());
  const end   = fmt(addDays(new Date(), 15));
  const g = buildGapsFlat(today, end);
  Logger.log('Gaps: ' + g.total_sin_agendar + '/' + g.total_fuentes);
  Logger.log(JSON.stringify(g.fuentes));
  if (g.errors && g.errors.length) Logger.log('Errors: ' + g.errors.join(' | '));
}

function testCreateEventReal() {
  // ⚠️ CREA UN EVENTO REAL en calendar GAT con fecha lejana (2026-12-31)
  // Usar solo para verificar que el write API funciona.
  // Después borrar manualmente el evento del calendar.
  const r = createEventFromBooking({
    reserva: 'TEST-SYSTEM', marca: 'M1', fecha: '2026-12-31', hora: '06:00', pax: 1,
    nombre: 'prueba sistema no borrar', email: 'test@wefly.mx', phone: '+525512345678',
    producto: 'TEST Vuelo', total: '1', fuente: 'Test',
  }, false);
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
