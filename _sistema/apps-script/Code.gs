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
function doGet(e) {
  try {
    const data = buildDashboardData();
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: err.message,
      stack: err.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Orchestrator ──────────────────────────────────────
function buildDashboardData() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today.getTime() + 14*24*60*60*1000);
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
  const desc = ev.getDescription() || '';
  const start = ev.getStartTime();
  const dateStr = fmt(start);
  const timeStr = Utilities.formatDate(start, TZ, 'HH:mm');

  // Parse title: "✅ *2P Juan Carlos García" or "⚡ *4P Nombre"
  let status = 'tentativo';
  if (title.includes('✅')) status = 'confirmado';
  else if (title.includes('🔄') || title.includes('✏')) status = 'modificado';
  else if (title.includes('❌')) status = 'cancelado';

  let pax = 0;
  const paxM = title.match(/\*(\d+)P\b/i);
  if (paxM) pax = parseInt(paxM[1]);

  // Name: everything after the pax marker
  let name = title.replace(/^[^\w]*/, '').replace(/\*\d+P\s*/i, '').trim();
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
      const evText = (ev.title_raw + ' ' + ev.email + ' ' + ev.phone + ' ' + ev.name).toLowerCase();

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

// ── Test helper (run from script editor) ──────────────
function testBuild() {
  const data = buildDashboardData();
  Logger.log('Events: ' + data.events.length);
  Logger.log('Bookeo emails: ' + data.bookeo_emails.length);
  Logger.log('Viator emails: ' + data.viator_emails.length);
  Logger.log('Pending Bookeo not in cal: ' + data.missing_bookeo.length);
  Logger.log('Pending Viator not in cal: ' + data.missing_viator.length);
  Logger.log(JSON.stringify(data).length + ' bytes');
}
