#!/usr/bin/env python3
"""
WE FLY — Cliente Turitop API
============================
Lee las 2 marcas desde .env, obtiene access_token OAuth2 y descarga TODOS los
bookings de una ventana de fechas usando chunking adaptativo (bisección) para
esquivar el cap duro de 100 resultados por llamada.

Escribe:
  - turitop_raw_M1.json       (respuesta cruda de Globos Aerostáticos Teotihuacán)
  - turitop_raw_M2.json       (respuesta cruda de Vuelos en Globo MX)
  - turitop_bookings.json     (bookings NORMALIZADOS y unificados)

Uso:
  python3 wefly_turitop_client.py                    # ventana default: 180d atrás → 90d adelante
  python3 wefly_turitop_client.py --from 2025-10-01 --to 2026-07-01

Nota: Turitop OAuth2 valida IP — hay que correrlo desde la misma red donde se
generó la key. Si migras a servidor con IP dinámica, cambiar a modo Bearer.
"""
from __future__ import annotations
import argparse, html, json, os, sys, time, datetime as dt, urllib.request, urllib.error

BASE_URL = "https://app.turitop.com/v1"
ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
OUT_DIR  = os.path.dirname(os.path.abspath(__file__))

# ───────────────────────────────────────── helpers ─────────────────────────────────────────

def load_env(path: str) -> dict:
    env = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env

def http_post(url: str, payload: dict, timeout: int = 25) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code} on {url}: {body[:300]}")

def ts(d: dt.datetime) -> int:
    return int(d.replace(tzinfo=dt.timezone.utc).timestamp())

def parse_date(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s).replace(hour=0, minute=0, second=0, microsecond=0)

def clean(s) -> str:
    """Decodifica entidades HTML y espacios — los nombres vienen con &aacute; etc."""
    if not isinstance(s, str):
        return ""
    return html.unescape(s).strip()

# ───────────────────────────────────────── Turitop API ─────────────────────────────────────────

def grant(short_id: str, secret_key: str) -> str:
    j = http_post(
        f"{BASE_URL}/authorization/grant",
        {"short_id": short_id, "secret_key": secret_key},
    )
    tok = j.get("data", {}).get("access_token")
    if not tok:
        raise RuntimeError(f"grant failed: {json.dumps(j)[:300]}")
    return tok

def get_bookings_chunk(token: str, from_ts: int, to_ts: int) -> list:
    j = http_post(
        f"{BASE_URL}/booking/getbookings",
        {
            "access_token": token,
            "data": {
                "filter": {
                    "bookings_date_from": from_ts,
                    "bookings_date_to": to_ts,
                    "show_deleted": 0,
                }
            },
        },
    )
    return j.get("data", {}).get("bookings", []) or []

def get_all_bookings(token: str, window_from: dt.datetime, window_to: dt.datetime,
                     cap: int = 100, min_days: int = 1) -> list:
    """Chunking adaptativo: parte la ventana hasta que ningún pedazo tope el cap de 100."""
    stack = [(window_from, window_to)]
    out   = []
    seen  = set()
    pages = 0
    while stack:
        a, b = stack.pop()
        if a >= b:
            continue
        pages += 1
        chunk = get_bookings_chunk(token, ts(a), ts(b))
        n = len(chunk)
        span_days = (b - a).days
        if n >= cap and span_days > min_days:
            # Topamos el cap → bisecta
            mid = a + (b - a) / 2
            stack.append((a, mid))
            stack.append((mid, b))
            continue
        for bk in chunk:
            sid = bk.get("short_id")
            if sid and sid not in seen:
                seen.add(sid)
                out.append(bk)
    print(f"    · {pages} llamadas a la API · {len(out)} bookings únicos")
    return out

# ───────────────────────────────────────── normalización ─────────────────────────────────────────

def normalize(raw: dict, marca_label: str, marca_slot: str) -> dict:
    cd = raw.get("client_data", {}) or {}
    tc = raw.get("ticket_type_count", []) or []
    pax = sum(int(t.get("count") or 0) for t in tc)
    ticket_breakdown = {clean(t.get("name", "")): int(t.get("count") or 0) for t in tc}

    date_event = raw.get("date_event_iso8601") or ""
    # Turitop da ISO con offset: 2026-04-08T06:00:00-0600
    fecha_evento = date_event[:10] if date_event else ""
    hora_evento  = date_event[11:16] if len(date_event) >= 16 else ""

    return {
        "source": "turitop",
        "marca": marca_label,
        "marca_slot": marca_slot,        # M1 / M2
        "reserva": raw.get("short_id", ""),
        "producto": clean(raw.get("product_name", "")),
        "product_short_id": raw.get("product_short_id", ""),
        "fecha_evento": fecha_evento,     # YYYY-MM-DD
        "hora_evento": hora_evento,
        "date_event_iso": date_event,
        "date_event_unix": raw.get("date_event"),
        "fecha_reserva": (raw.get("date_booking_iso8601") or "")[:10],
        "pax": pax,
        "pax_breakdown": ticket_breakdown,
        "cliente": {
            "nombre": clean(cd.get("name", "")),
            "email":  clean(cd.get("email", "")),
            "phone":  clean(cd.get("phone", "")),
            "hotel":  clean(cd.get("hotel", "")),
            "idioma": clean(cd.get("language", "")),
            "pais":   clean(cd.get("country", "")),
            "comments": clean(cd.get("comments", "")) or clean(cd.get("customtextarea", "")),
        },
        "total": raw.get("total_price"),
        "moneda": raw.get("currency"),
        "estado": "cancelada" if raw.get("archived") else "activa",
        "archivada": bool(raw.get("archived")),
        "agente": clean(raw.get("user_name", "")),
    }

# ───────────────────────────────────────── main ─────────────────────────────────────────

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--from", dest="d_from", help="Fecha inicio (YYYY-MM-DD). Default: hoy-7d")
    p.add_argument("--to",   dest="d_to",   help="Fecha fin (YYYY-MM-DD). Default: hoy+7d")
    args = p.parse_args()

    env = load_env(ENV_FILE)

    marcas = []
    for slot in ("M1", "M2"):
        sid = env.get(f"TURITOP_{slot}_SHORT_ID", "")
        sk  = env.get(f"TURITOP_{slot}_SECRET_KEY", "")
        lbl = env.get(f"TURITOP_{slot}_LABEL", "") or f"Marca {slot}"
        if sid and sk:
            marcas.append((slot, sid, sk, lbl))

    if not marcas:
        print("ERROR: no hay credenciales TURITOP_* en .env", file=sys.stderr)
        sys.exit(1)

    today = dt.datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    w_from = parse_date(args.d_from) if args.d_from else today - dt.timedelta(days=180)
    w_to   = parse_date(args.d_to)   if args.d_to   else today + dt.timedelta(days=90)
    print(f"Ventana filtro bookings_date (creación): {w_from.date()} → {w_to.date()}")

    unified = []
    for slot, sid, sk, lbl in marcas:
        print(f"\n▶ {slot} · {lbl} ({sid})")
        tok = grant(sid, sk)
        print("    · token OK")
        raws = get_all_bookings(tok, w_from, w_to)
        # Volcado crudo por marca (debugging)
        with open(os.path.join(OUT_DIR, f"turitop_raw_{slot}.json"), "w", encoding="utf-8") as f:
            json.dump(raws, f, ensure_ascii=False, indent=2)
        for r in raws:
            unified.append(normalize(r, lbl, slot))

    # Ordena por fecha_evento
    unified.sort(key=lambda x: (x["fecha_evento"], x["hora_evento"]))

    out_path = os.path.join(OUT_DIR, "turitop_bookings.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": dt.datetime.utcnow().isoformat() + "Z",
            "window_from": w_from.date().isoformat(),
            "window_to":   w_to.date().isoformat(),
            "total": len(unified),
            "by_marca": {
                lbl: sum(1 for b in unified if b["marca"] == lbl)
                for _, _, _, lbl in marcas
            },
            "bookings": unified,
        }, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Escrito: {out_path}")
    print(f"   Total bookings normalizados: {len(unified)}")
    for _, _, _, lbl in marcas:
        n = sum(1 for b in unified if b["marca"] == lbl)
        print(f"   · {lbl}: {n}")

if __name__ == "__main__":
    main()
