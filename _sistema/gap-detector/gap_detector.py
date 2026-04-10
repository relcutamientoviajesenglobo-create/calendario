#!/usr/bin/env python3
"""
WE FLY — Gap Detector v2 (auto-update)
========================================
Compara bookings conocidos (Turitop + Bookeo) contra eventos frescos de
Google Calendar y produce reservas_sin_agendar.json con las reservas que
NO están en el calendario.

Inputs (mismo directorio):
  - calendar_events.json   ← eventos frescos (generado por la tarea programada)
  - turitop_all.json       ← bookings Turitop
  - bookeo_all.json        ← bookings Bookeo scraped de Gmail

Output (directorio padre):
  - reservas_sin_agendar.json

Uso:
  python3 gap_detector.py                           # ventana auto: -1/+7 días
  python3 gap_detector.py --from 2026-04-01 --to 2026-04-15
"""
from __future__ import annotations
import json, re, unicodedata, argparse, sys
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE.parent.parent  # CALENDARIO WE FLY/ (subimos 2 niveles: gap-detector → _sistema → CALENDARIO)

# ─── Normalization helpers ───

def norm(s: str) -> str:
    if not s: return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", s.lower())

def last10(phone: str) -> str:
    d = re.sub(r"\D", "", phone or "")
    return d[-10:] if len(d) >= 10 else d

STOP = {"de","la","el","los","las","del","van","di","da","jr","sr","mc","mac","dr","med",
        "reserva","abonada","vuelo","globo","compartido","privado","teotihuacan"}

def tokens(name: str) -> list[str]:
    name = unicodedata.normalize("NFKD", name or "").encode("ascii","ignore").decode().lower()
    parts = re.findall(r"[a-z]{3,}", name)
    return [p for p in parts if p not in STOP]

# ─── Calendar indexer ───

def build_cal_index(events: list[dict]) -> dict:
    """Returns {date: [{sum, emails, phones, tokens}]}"""
    idx = {}
    for ev in events:
        d = ev.get("date", "")
        txt = (ev.get("summary", "") + " " + ev.get("desc", "")).lower()
        emails = set(re.findall(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", txt))
        phones = set()
        for raw in re.findall(r"[\d][\d\s().+-]{7,}\d", txt):
            p = last10(raw)
            if p:
                phones.add(p)
        toks = set(tokens(
            ev.get("summary", "") + " " + re.sub(r"[^\w\s@]", " ", ev.get("desc", ""))
        ))
        idx.setdefault(d, []).append({
            "sum": ev.get("summary", ""),
            "emails": emails,
            "phones": phones,
            "tokens": toks,
        })
    return idx

# ─── Matchers ───

def match_bookeo(b: dict, cal_index: dict):
    d = b.get("d", "")
    events = cal_index.get(d, [])
    em = (b.get("e", "") or "").lower().strip()
    ph = last10(b.get("t", ""))
    clean_name = re.sub(r"^reserva\s+abonada\s*-\s*", "", b.get("n", ""), flags=re.I)
    nm_toks = set(tokens(clean_name))
    for ev in events:
        if em and em in ev["emails"]:
            return ("email", ev["sum"])
        if ph and ph in ev["phones"]:
            return ("phone", ev["sum"])
        if nm_toks:
            overlap = nm_toks & ev["tokens"]
            if len(overlap) >= 2:
                return ("name2", ev["sum"])
            rares = [t for t in overlap if len(t) >= 6]
            if rares:
                return ("name1rare", ev["sum"])
    return None

def match_turitop(b: dict, cal_index: dict):
    d = b.get("fecha", "")
    events = cal_index.get(d, [])
    em = (b.get("email", "") or "").lower().strip()
    ph = last10(b.get("phone", ""))
    nm_toks = set(tokens(b.get("nombre", "")))
    reserva_id = (b.get("reserva", "") or "").lower()
    for ev in events:
        # Match by reserva ID
        if reserva_id and reserva_id in " ".join(str(v) for v in [ev["sum"]] + list(ev["emails"])).lower():
            return ("reserva_id", ev["sum"])
        if em and em in ev["emails"]:
            return ("email", ev["sum"])
        if ph and ph in ev["phones"]:
            return ("phone", ev["sum"])
        if nm_toks:
            overlap = nm_toks & ev["tokens"]
            if len(overlap) >= 2:
                return ("name2", ev["sum"])
            rares = [t for t in overlap if len(t) >= 6]
            if rares:
                return ("name1rare", ev["sum"])
    return None

# ─── Main ───

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="date_from", default=None)
    parser.add_argument("--to", dest="date_to", default=None)
    args = parser.parse_args()

    today = datetime.now().date()
    d_from = args.date_from or str(today)
    d_to = args.date_to or str(today + timedelta(days=7))

    # Load calendar events
    cal_path = HERE / "calendar_events.json"
    if not cal_path.exists():
        print(f"ERROR: {cal_path} no encontrado. La tarea programada debe generarlo.", file=sys.stderr)
        sys.exit(1)
    cal_events = json.loads(cal_path.read_text())
    print(f"Calendar events loaded: {len(cal_events)}")

    # Filter to window
    cal_events = [e for e in cal_events if d_from <= e.get("date", "") <= d_to]
    print(f"Calendar events in window [{d_from} → {d_to}]: {len(cal_events)}")

    cal_index = build_cal_index(cal_events)

    # Load Turitop
    turitop_path = HERE / "turitop_all.json"
    turitop = json.loads(turitop_path.read_text()) if turitop_path.exists() else []
    turitop = [b for b in turitop if d_from <= b.get("fecha", "") <= d_to]
    print(f"Turitop bookings in window: {len(turitop)}")

    # Load Bookeo
    bookeo_path = HERE / "bookeo_all.json"
    bookeo = json.loads(bookeo_path.read_text()) if bookeo_path.exists() else []
    bookeo = [b for b in bookeo if d_from <= b.get("d", "") <= d_to]
    print(f"Bookeo bookings in window: {len(bookeo)}")

    # Match Turitop
    tur_matched, tur_unmatched = 0, []
    for b in turitop:
        if match_turitop(b, cal_index):
            tur_matched += 1
        else:
            tur_unmatched.append(b)

    # Match Bookeo
    bk_matched, bk_unmatched = 0, []
    for b in bookeo:
        if match_bookeo(b, cal_index):
            bk_matched += 1
        else:
            bk_unmatched.append(b)

    print(f"\nResultados:")
    print(f"  Turitop: {len(turitop)} total, {tur_matched} matched, {len(tur_unmatched)} sin agendar")
    print(f"  Bookeo:  {len(bookeo)} total, {bk_matched} matched, {len(bk_unmatched)} sin agendar")

    # Normalize to common format
    all_items = []
    for b in tur_unmatched:
        item = dict(b)
        item["fuente"] = "Turitop"
        all_items.append(item)

    for b in bk_unmatched:
        all_items.append({
            "reserva": f"BK-{bookeo.index(b)+1:03d}",
            "marca": "BK",
            "fecha": b["d"],
            "hora": b["h"].rjust(5, "0") if ":" in b["h"] else b["h"],
            "pax": b["p"],
            "nombre": re.sub(r"^Reserva\s+abonada\s*-\s*", "", b.get("n",""), flags=re.I).strip(),
            "email": b["e"],
            "phone": "+" + b["t"] if b["t"] else "",
            "producto": b["x"],
            "total": "",
            "fuente": "Bookeo"
        })

    all_items.sort(key=lambda x: (x.get("fecha", ""), x.get("hora", ""), x.get("nombre", "")))

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    output = {
        "generated_at": now_str,
        "window": f"{d_from} → {d_to}",
        "fuentes": {
            "Turitop": {"total": len(turitop), "matched": tur_matched, "sin_agendar": len(tur_unmatched)},
            "Bookeo":  {"total": len(bookeo), "matched": bk_matched, "sin_agendar": len(bk_unmatched)},
        },
        "total_fuentes": len(turitop) + len(bookeo),
        "total_sin_agendar": len(all_items),
        "bookings": all_items
    }

    out_path = OUT_DIR / "reservas_sin_agendar.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))
    print(f"\n✅ {out_path.name}: {len(all_items)} sin agendar")
    return 0

if __name__ == "__main__":
    sys.exit(main())
