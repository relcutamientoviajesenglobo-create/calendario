#!/usr/bin/env python3
"""
WE FLY — build_calendar_events.py
==================================
Regenera `calendar_events.json` llamando al Apps Script Web App
(endpoint ?action=events_flat) que consulta los 9 calendarios operativos
y retorna los eventos con emails/phones pre-extraídos.

Configuración:
  - Export APPS_SCRIPT_URL en tu shell o en _sistema/.env:
    APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfyc.../exec

Uso:
  python3 build_calendar_events.py                    # ventana hoy-7d .. hoy+30d
  python3 build_calendar_events.py --from 2026-04-01 --to 2026-05-01
"""
import argparse, json, os, sys, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV_PATH = HERE.parent / ".env"

def load_env():
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    # Shell env overrides .env
    for k in ["APPS_SCRIPT_URL"]:
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="date_from", default=None)
    ap.add_argument("--to",   dest="date_to",   default=None)
    ap.add_argument("--timeout", type=int, default=120, help="Timeout HTTP (default 120s)")
    args = ap.parse_args()

    env = load_env()
    url = env.get("APPS_SCRIPT_URL", "").strip()
    if not url:
        print(
            "❌ APPS_SCRIPT_URL no configurada.\n\n"
            "Opciones:\n"
            "  1) Deploy el Apps Script (_sistema/apps-script/Code.gs) como Web App.\n"
            "     Ver: _sistema/apps-script/SETUP.md\n"
            "  2) Pega la URL en _sistema/.env:\n"
            "     APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec\n"
            "  3) O expórtala en tu shell:\n"
            "     export APPS_SCRIPT_URL='https://script.google.com/macros/s/.../exec'\n",
            file=sys.stderr
        )
        sys.exit(1)

    today = datetime.now().date()
    d_from = args.date_from or str(today - timedelta(days=1))
    d_to   = args.date_to   or str(today + timedelta(days=15))

    qs = urllib.parse.urlencode({
        "action": "events_flat",
        "from":   d_from,
        "to":     d_to,
    })
    full_url = f"{url}?{qs}"
    print(f"→ GET {full_url}")
    try:
        with urllib.request.urlopen(full_url, timeout=args.timeout) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ URL error: {e}", file=sys.stderr)
        sys.exit(1)
    except TimeoutError:
        print(f"❌ Timeout {args.timeout}s — Apps Script puede estar calentando. Reintenta.", file=sys.stderr)
        sys.exit(1)

    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        print(f"❌ Respuesta no es JSON válido: {e}\n{body[:500]}", file=sys.stderr)
        sys.exit(1)

    if isinstance(data, dict) and "error" in data:
        print(f"❌ Apps Script error: {data.get('error')}\n{data.get('stack','')}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(data, list):
        print(f"❌ Se esperaba array, llegó {type(data).__name__}:\n{body[:500]}", file=sys.stderr)
        sys.exit(1)

    # Stats por calendario
    from collections import Counter
    cals = Counter(e.get("calendar", "?") for e in data)
    out_path = HERE / "calendar_events.json"
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))

    # Sidecar metadata: la ventana solicitada al generador.
    # Se usa por gap_detector.py para evitar falsos positivos del pre-check
    # cuando el calendario tiene huecos al inicio/fin de la ventana.
    meta_path = HERE / "calendar_events.meta.json"
    meta = {
        "requested_from": d_from,
        "requested_to":   d_to,
        "generated_at":   datetime.now().isoformat(),
        "events_count":   len(data),
        "calendars_present": sorted(cals.keys()),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2))

    print(f"\n✅ {out_path.name}: {len(data)} eventos escritos")
    print(f"   Ventana: {d_from} → {d_to}")
    print("   Por calendario:")
    for c, n in sorted(cals.items()):
        print(f"     {c:12s} {n}")

if __name__ == "__main__":
    main()
