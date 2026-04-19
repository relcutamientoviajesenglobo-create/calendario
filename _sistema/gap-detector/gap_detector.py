#!/usr/bin/env python3
"""
WE FLY — Gap Detector v3 (anti-falsos-positivos)
=================================================
Compara bookings conocidos (Turitop + Bookeo) contra eventos frescos de
Google Calendar y produce reservas_sin_agendar.json con las reservas que
NO están en el calendario.

CAMBIOS v3 (2026-04-18):
  - Pre-check estricta de cobertura: aborta si calendar_events.json
    no cubre la ventana de bookings, o si no cubre los 9 calendarios.
  - Match con ventana ±1 día (tolera eventos agendados en día adyacente).
  - Match por reserva_id con regex de dígitos (tolera formato G465260106 vs G465-260106-2).
  - Usa campos pre-extraídos `emails` y `phones` si vienen en el JSON.
  - Modo --debug con diagnóstico por booking sin match.
  - Logging por calendario de origen del match.

Inputs (mismo directorio):
  - calendar_events.json   ← eventos frescos de GCal (los 9 calendarios)
  - turitop_all.json       ← bookings Turitop
  - bookeo_all.json        ← bookings Bookeo scraped de Gmail

Output (directorio padre):
  - reservas_sin_agendar.json

Uso:
  python3 gap_detector.py                               # ventana auto: hoy/+7d
  python3 gap_detector.py --from 2026-04-01 --to 2026-04-15
  python3 gap_detector.py --debug                       # diagnóstico detallado
  python3 gap_detector.py --slack 2                     # ventana ±2 días
  python3 gap_detector.py --strict 0                    # desactivar pre-check (no recomendado)
"""
from __future__ import annotations
import json, re, unicodedata, argparse, sys
from datetime import datetime, timedelta, date
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent.parent  # CALENDARIO WE FLY/

# Los 9 calendarios que DEBEN aparecer en calendar_events.json (campo "calendar")
# Nombres canónicos. El generador (Apps Script / build_calendar_events.py) debe emitirlos así.
EXPECTED_CALENDARS = {
    "PRIMARY", "BOOKEO", "GAT", "VGMX",
    "VIATOR", "GAMX_MONSE", "RECEPCION",
    "BOKUN", "SOLO_BOKUN",
}

# ─── Normalization helpers ───

def norm(s: str) -> str:
    if not s: return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())

def last10(phone: str) -> str:
    d = re.sub(r"\D", "", phone or "")
    return d[-10:] if len(d) >= 10 else d

def digits_only(s: str) -> str:
    return re.sub(r"\D", "", s or "")

STOP = {"de","la","el","los","las","del","van","di","da","jr","sr","mc","mac","dr","med",
        "reserva","abonada","vuelo","globo","compartido","privado","teotihuacan",
        "reserve","booking","confirmada","pendiente"}

def tokens(name: str) -> list[str]:
    name = unicodedata.normalize("NFKD", name or "").encode("ascii","ignore").decode().lower()
    parts = re.findall(r"[a-z]{3,}", name)
    return [p for p in parts if p not in STOP]

EMAIL_RE = re.compile(r"[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}")
PHONE_RE = re.compile(r"[\d][\d\s().+\-]{7,}\d")
RESERVA_RE = re.compile(r"[GV]\d{3}[\- ]?\d{6}[\- ]?\d+", re.I)

# ─── Calendar indexer ───

def build_cal_index(events: list[dict]) -> dict:
    """
    Returns {date: [{sum, cal, emails, phones, tokens, full_text}]}
    Acepta eventos con campos pre-extraídos `emails` / `phones` (recomendado)
    o los re-extrae del texto si no vienen.
    """
    idx = {}
    for ev in events:
        d = ev.get("date", "")
        summary = ev.get("summary", "") or ""
        desc = ev.get("desc", "") or ""
        txt = (summary + " " + desc).lower()

        # Prefer pre-extracted emails/phones (más confiables si desc venía truncado en origen)
        emails = set(e.lower() for e in (ev.get("emails") or []))
        if not emails:
            emails = set(EMAIL_RE.findall(txt))

        phones = set(ev.get("phones") or [])
        if not phones:
            for raw in PHONE_RE.findall(txt):
                p = last10(raw)
                if p: phones.add(p)

        toks = set(tokens(summary + " " + re.sub(r"[^\w\s@]", " ", desc)))

        # Texto completo normalizado para búsqueda por reserva_id (con y sin guiones)
        full_text = txt
        full_digits = digits_only(txt)

        idx.setdefault(d, []).append({
            "sum": summary,
            "cal": ev.get("calendar", "?"),
            "emails": emails,
            "phones": phones,
            "tokens": toks,
            "full_text": full_text,
            "full_digits": full_digits,
        })
    return idx

def events_around(cal_index: dict, date_str: str, slack: int = 1) -> list[dict]:
    """Eventos en fecha ± slack días (tolera off-by-one por timezone o agendamiento)."""
    try:
        d0 = datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        return cal_index.get(date_str, [])
    out = []
    for delta in range(-slack, slack+1):
        dd = str(d0 + timedelta(days=delta))
        out.extend(cal_index.get(dd, []))
    return out

# ─── Matchers ───

def match_bookeo(b: dict, cal_index: dict, slack: int = 1):
    d = b.get("d", "")
    events = events_around(cal_index, d, slack=slack)
    em = (b.get("e", "") or "").lower().strip()
    ph = last10(b.get("t", ""))
    clean_name = re.sub(r"^reserva\s+abonada\s*-\s*", "", b.get("n", ""), flags=re.I)
    nm_toks = set(tokens(clean_name))
    for ev in events:
        if em and em in ev["emails"]:
            return ("email", ev["sum"], ev["cal"])
        if ph and ph in ev["phones"]:
            return ("phone", ev["sum"], ev["cal"])
        if nm_toks:
            overlap = nm_toks & ev["tokens"]
            if len(overlap) >= 2:
                return ("name2", ev["sum"], ev["cal"])
            rares = [t for t in overlap if len(t) >= 6]
            if rares:
                return ("name1rare", ev["sum"], ev["cal"])
    return None

def match_turitop(b: dict, cal_index: dict, slack: int = 1):
    d = b.get("fecha", "")
    events = events_around(cal_index, d, slack=slack)
    em = (b.get("email", "") or "").lower().strip()
    ph = last10(b.get("phone", ""))
    nm_toks = set(tokens(b.get("nombre", "")))
    rid = (b.get("reserva", "") or "").lower()
    rid_digits = digits_only(rid)          # "4652601062"
    # Prefix de 9 dígitos suele identificar únicamente la reserva (Gxxx + YYMMDD)
    rid_short = rid_digits[:9] if len(rid_digits) >= 9 else rid_digits

    for ev in events:
        # 1) Reserva ID (flexible: con guiones o solo dígitos)
        if rid and rid in ev["full_text"]:
            return ("reserva_id", ev["sum"], ev["cal"])
        if rid_short and rid_short in ev["full_digits"]:
            return ("reserva_id_digits", ev["sum"], ev["cal"])
        # 2) Email
        if em and em in ev["emails"]:
            return ("email", ev["sum"], ev["cal"])
        # 3) Phone last10
        if ph and ph in ev["phones"]:
            return ("phone", ev["sum"], ev["cal"])
        # 4) Name tokens
        if nm_toks:
            overlap = nm_toks & ev["tokens"]
            if len(overlap) >= 2:
                return ("name2", ev["sum"], ev["cal"])
            rares = [t for t in overlap if len(t) >= 6]
            if rares:
                return ("name1rare", ev["sum"], ev["cal"])
    return None

# ─── Debug helpers ───

def diagnose_unmatch(b: dict, cal_index: dict, source: str, slack: int = 1):
    d = b.get("fecha") if source == "Turitop" else b.get("d")
    evs = events_around(cal_index, d or "", slack=slack)
    rid = b.get("reserva", "?")
    nombre = b.get("nombre") or b.get("n") or ""
    email = b.get("email") or b.get("e") or ""
    phone = b.get("phone") or b.get("t") or ""
    print(f"\n  [UNMATCH {source}] {rid} · {d} · {nombre}")
    print(f"    → email:  {email}")
    print(f"    → phone10: {last10(phone)}")
    print(f"    → tokens:  {tokens(nombre)}")
    if source == "Turitop":
        print(f"    → rid_dig: {digits_only(rid)[:9]}")
    print(f"    Eventos en ventana ±{slack}d: {len(evs)}")
    for ev in evs[:6]:
        em_preview = list(ev['emails'])[:2]
        ph_preview = list(ev['phones'])[:2]
        print(f"      · [{ev['cal']}] {ev['sum'][:70]}")
        print(f"         emails={em_preview} phones={ph_preview}")
    if len(evs) > 6:
        print(f"      ... y {len(evs)-6} más")

# ─── Pre-checks ───

def preflight_checks(cal_events: list[dict], bookings_window_from: str, bookings_window_to: str, strict: bool = True) -> list[str]:
    """
    Retorna lista de warnings. Si strict=True, warnings fatales abortan.
    """
    warnings = []
    fatal = []

    if not cal_events:
        fatal.append("calendar_events.json está vacío")
        return fatal

    # 1) Ventana temporal: el generador debe haber pedido una ventana que cubra
    #    la ventana de bookings. Preferimos leer la ventana SOLICITADA desde el
    #    sidecar metadata (evita falsos positivos si no hay eventos en los días
    #    finales/iniciales). Fallback a inferir desde eventos si no hay metadata.
    meta_path = HERE / "calendar_events.meta.json"
    requested_from = None
    requested_to = None
    if meta_path.exists():
        try:
            meta = json.loads(meta_path.read_text())
            requested_from = meta.get("requested_from")
            requested_to = meta.get("requested_to")
        except Exception:
            pass

    try:
        b_from = datetime.strptime(bookings_window_from, "%Y-%m-%d").date()
        b_to   = datetime.strptime(bookings_window_to,   "%Y-%m-%d").date()

        if requested_from and requested_to:
            # Modo confianza: el generador nos dice qué ventana pidió al Apps Script.
            rf = datetime.strptime(requested_from, "%Y-%m-%d").date()
            rt = datetime.strptime(requested_to,   "%Y-%m-%d").date()
            if rf > b_from:
                fatal.append(
                    f"calendar_events.json fue generado con ventana [{requested_from}..{requested_to}] "
                    f"que NO cubre bookings_from={bookings_window_from}. "
                    f"Regenera: python3 build_calendar_events.py --from {bookings_window_from} --to {bookings_window_to}"
                )
            if rt < b_to:
                fatal.append(
                    f"calendar_events.json fue generado con ventana [{requested_from}..{requested_to}] "
                    f"que NO cubre bookings_to={bookings_window_to}. "
                    f"Regenera: python3 build_calendar_events.py --from {bookings_window_from} --to {bookings_window_to}"
                )
        else:
            # Fallback: inferir desde fechas de eventos (con tolerancia).
            TOLERANCE = 2
            cal_min = min((e.get("date","") for e in cal_events), default="")
            cal_max = max((e.get("date","") for e in cal_events), default="")
            c_min  = datetime.strptime(cal_min, "%Y-%m-%d").date() if cal_min else None
            c_max  = datetime.strptime(cal_max, "%Y-%m-%d").date() if cal_max else None
            if c_min is None or (c_min - b_from).days > TOLERANCE:
                fatal.append(
                    f"calendar_events.json NO cubre inicio: cal_min={cal_min}, bookings_from={bookings_window_from}. "
                    f"Regenera con ventana ≥ [{bookings_window_from}, {bookings_window_to}]"
                )
            if c_max is None or (b_to - c_max).days > TOLERANCE:
                fatal.append(
                    f"calendar_events.json NO cubre fin: cal_max={cal_max}, bookings_to={bookings_window_to}. "
                    f"Regenera con ventana ≥ [{bookings_window_from}, {bookings_window_to}]"
                )
            warnings.append("calendar_events.meta.json ausente — usando inferencia por fechas de eventos (menos confiable)")
    except Exception as e:
        warnings.append(f"No pude validar ventana temporal: {e}")

    # 2) Cobertura de calendarios
    cals_present = {e.get("calendar") for e in cal_events if e.get("calendar")}
    cals_present_norm = {str(c).upper().replace(" ", "_").replace("-", "_") for c in cals_present}

    if not cals_present:
        fatal.append(
            "Ningún evento tiene campo `calendar`. El generador debe emitir "
            "{date, summary, desc, calendar, emails, phones} por evento."
        )
    else:
        missing = set()
        for expected in EXPECTED_CALENDARS:
            if not any(expected in c for c in cals_present_norm):
                missing.add(expected)
        if missing:
            # Los 4 opcionales pueden estar legítimamente vacíos; warning no fatal.
            optional = {"VIATOR", "GAMX_MONSE", "RECEPCION", "BOKUN", "SOLO_BOKUN"}
            missing_critical = missing - optional
            missing_optional = missing & optional
            if missing_critical:
                fatal.append(
                    f"FALTAN calendarios CRÍTICOS en calendar_events.json: {sorted(missing_critical)}. "
                    f"Presentes: {sorted(cals_present)}"
                )
            if missing_optional:
                warnings.append(
                    f"Calendarios opcionales ausentes (pueden estar vacíos legítimamente): {sorted(missing_optional)}"
                )

    if strict and fatal:
        for msg in fatal:
            print(f"❌ PRE-CHECK FATAL: {msg}", file=sys.stderr)
        for msg in warnings:
            print(f"⚠️  PRE-CHECK WARN: {msg}", file=sys.stderr)
        print(
            "\n⛔ Abortando: el calendar_events.json no es suficientemente completo.\n"
            "   Para forzar ejecución de todos modos: --strict 0 (NO recomendado, producirá falsos positivos).\n",
            file=sys.stderr
        )
        sys.exit(2)

    return warnings + fatal  # (no fatal si strict=False)

# ─── Main ───

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="date_from", default=None)
    parser.add_argument("--to",   dest="date_to",   default=None)
    parser.add_argument("--slack", type=int, default=1, help="Ventana de tolerancia en días (default 1)")
    parser.add_argument("--strict", type=int, default=1, help="1=abortar si pre-check falla (default), 0=solo warn")
    parser.add_argument("--debug", action="store_true", help="Loguea diagnóstico por booking sin match")
    args = parser.parse_args()

    today = datetime.now().date()
    d_from = args.date_from or str(today - timedelta(days=1))
    d_to   = args.date_to   or str(today + timedelta(days=15))

    # Load calendar events
    cal_path = HERE / "calendar_events.json"
    if not cal_path.exists():
        print(f"ERROR: {cal_path} no encontrado. Regenera con build_calendar_events.py o Apps Script Web App.", file=sys.stderr)
        sys.exit(1)
    cal_events = json.loads(cal_path.read_text())
    print(f"Calendar events cargados: {len(cal_events)}")

    # ── PRE-CHECKS (anti-falsos-positivos) ──
    preflight_checks(cal_events, d_from, d_to, strict=bool(args.strict))

    # Stats de origen
    from collections import Counter
    cal_counter = Counter(e.get("calendar","?") for e in cal_events)
    print("  Por calendario:", dict(cal_counter))

    # Filter to window (±slack días para ser generoso en el índice)
    slack = args.slack
    try:
        d_from_d = datetime.strptime(d_from, "%Y-%m-%d").date()
        d_to_d   = datetime.strptime(d_to,   "%Y-%m-%d").date()
        idx_from = str(d_from_d - timedelta(days=slack))
        idx_to   = str(d_to_d   + timedelta(days=slack))
    except Exception:
        idx_from, idx_to = d_from, d_to

    cal_events_win = [e for e in cal_events if idx_from <= e.get("date","") <= idx_to]
    print(f"Calendar events en ventana [{idx_from} → {idx_to}] (±{slack}d): {len(cal_events_win)}")

    cal_index = build_cal_index(cal_events_win)

    # Load Turitop — tolera dos formatos:
    #   A) wrapper {generated_at, bookings:[...]} con items {fecha_evento, cliente:{...}}
    #   B) array plano [{fecha, nombre, email, phone, ...}]
    turitop_path = HERE / "turitop_all.json"
    turitop_raw = json.loads(turitop_path.read_text()) if turitop_path.exists() else []
    if isinstance(turitop_raw, dict) and "bookings" in turitop_raw:
        turitop_items = turitop_raw["bookings"]
    elif isinstance(turitop_raw, list):
        turitop_items = turitop_raw
    else:
        turitop_items = []
    # Normalizar a formato plano
    turitop = []
    for b in turitop_items:
        if not isinstance(b, dict):
            continue
        if b.get("archivada"):
            continue
        cliente = b.get("cliente", {}) if isinstance(b.get("cliente"), dict) else {}
        flat = {
            "reserva":  b.get("reserva") or b.get("short_id") or "",
            "marca":    b.get("marca_slot") or b.get("marca") or "",
            "fecha":    b.get("fecha") or b.get("fecha_evento") or "",
            "hora":     b.get("hora") or b.get("hora_evento") or "",
            "pax":      b.get("pax") or 0,
            "nombre":   b.get("nombre") or cliente.get("nombre") or "",
            "email":    b.get("email") or cliente.get("email") or "",
            "phone":    b.get("phone") or cliente.get("phone") or "",
            "producto": b.get("producto") or "",
            "total":    b.get("total") or "",
        }
        if d_from <= flat["fecha"] <= d_to:
            turitop.append(flat)
    print(f"Turitop bookings en ventana [{d_from} → {d_to}]: {len(turitop)}")

    # Load Bookeo
    bookeo_path = HERE / "bookeo_all.json"
    bookeo = json.loads(bookeo_path.read_text()) if bookeo_path.exists() else []
    bookeo = [b for b in bookeo if d_from <= b.get("d", "") <= d_to]
    print(f"Bookeo bookings en ventana: {len(bookeo)}")

    # Match Turitop
    tur_matched, tur_unmatched = 0, []
    tur_match_by_strategy = Counter()
    tur_match_by_calendar = Counter()
    for b in turitop:
        result = match_turitop(b, cal_index, slack=slack)
        if result:
            tur_matched += 1
            strategy, _, cal = result
            tur_match_by_strategy[strategy] += 1
            tur_match_by_calendar[cal] += 1
        else:
            tur_unmatched.append(b)

    # Match Bookeo
    bk_matched, bk_unmatched = 0, []
    bk_match_by_strategy = Counter()
    bk_match_by_calendar = Counter()
    for b in bookeo:
        result = match_bookeo(b, cal_index, slack=slack)
        if result:
            bk_matched += 1
            strategy, _, cal = result
            bk_match_by_strategy[strategy] += 1
            bk_match_by_calendar[cal] += 1
        else:
            bk_unmatched.append(b)

    print(f"\n━━━━━━━ Resultados ━━━━━━━")
    print(f"  Turitop: {len(turitop):3d} total · {tur_matched:3d} matched · {len(tur_unmatched):3d} sin agendar")
    if tur_matched:
        print(f"    estrategias: {dict(tur_match_by_strategy)}")
        print(f"    calendarios: {dict(tur_match_by_calendar)}")
    print(f"  Bookeo:  {len(bookeo):3d} total · {bk_matched:3d} matched · {len(bk_unmatched):3d} sin agendar")
    if bk_matched:
        print(f"    estrategias: {dict(bk_match_by_strategy)}")
        print(f"    calendarios: {dict(bk_match_by_calendar)}")

    # Debug unmatched
    if args.debug:
        print(f"\n━━━━━━━ Diagnóstico de no-matched ━━━━━━━")
        for b in tur_unmatched:
            diagnose_unmatch(b, cal_index, "Turitop", slack=slack)
        for b in bk_unmatched:
            diagnose_unmatch(b, cal_index, "Bookeo", slack=slack)

    # Normalize to common format
    all_items = []
    for b in tur_unmatched:
        item = dict(b)
        item["fuente"] = "Turitop"
        all_items.append(item)

    for b in bk_unmatched:
        all_items.append({
            "reserva": f"BK-{bookeo.index(b)+1:03d}",
            "marca":   "BK",
            "fecha":   b["d"],
            "hora":    b["h"].rjust(5, "0") if ":" in b["h"] else b["h"],
            "pax":     b["p"],
            "nombre":  re.sub(r"^Reserva\s+abonada\s*-\s*", "", b.get("n",""), flags=re.I).strip(),
            "email":   b["e"],
            "phone":   "+" + b["t"] if b["t"] else "",
            "producto": b["x"],
            "total":   "",
            "fuente":  "Bookeo",
        })

    all_items.sort(key=lambda x: (x.get("fecha", ""), x.get("hora", ""), x.get("nombre", "")))

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    output = {
        "generated_at":  now_str,
        "window":        f"{d_from} → {d_to}",
        "slack_days":    slack,
        "calendars_in_source": sorted(set(e.get("calendar","?") for e in cal_events)),
        "fuentes": {
            "Turitop": {"total": len(turitop), "matched": tur_matched, "sin_agendar": len(tur_unmatched),
                        "match_by_strategy": dict(tur_match_by_strategy),
                        "match_by_calendar": dict(tur_match_by_calendar)},
            "Bookeo":  {"total": len(bookeo),  "matched": bk_matched,  "sin_agendar": len(bk_unmatched),
                        "match_by_strategy": dict(bk_match_by_strategy),
                        "match_by_calendar": dict(bk_match_by_calendar)},
        },
        "total_fuentes":     len(turitop) + len(bookeo),
        "total_sin_agendar": len(all_items),
        "bookings":          all_items,
    }

    out_path = OUT_DIR / "reservas_sin_agendar.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"\n✅ {out_path.name}: {len(all_items)} sin agendar (de {len(turitop)+len(bookeo)} bookings)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
