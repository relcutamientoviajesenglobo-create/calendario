#!/usr/bin/env python3
"""
Genera el resumen del workflow en $GITHUB_STEP_SUMMARY.
Invocado por .github/workflows/update-gaps.yml (step "Write job summary").
"""
import json
import os
import sys
from datetime import datetime, timezone

summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
if not summary_path:
    # Corriendo local; dump a stdout
    summary_path = "/dev/stdout"

lines = []
now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
lines.append(f"### Gap detector run {now_utc}\n")

try:
    with open("reservas_sin_agendar.json", encoding="utf-8") as f:
        d = json.load(f)
    lines.append(f"**Ventana:** `{d.get('window','?')}`  ")
    lines.append(f"**Total sin agendar:** {d.get('total_sin_agendar', 0)} de {d.get('total_fuentes', 0)} bookings  \n")
    for src, s in d.get("fuentes", {}).items():
        lines.append(
            f"- **{src}**: {s.get('matched',0)}/{s.get('total',0)} matched · "
            f"{s.get('sin_agendar',0)} sin agendar"
        )
    unmatched = d.get("bookings", [])
    if unmatched:
        lines.append("\n#### ⚠️ Reservas sin agendar:\n")
        for b in unmatched[:20]:
            lines.append(
                f"- `{b.get('reserva','?')}` · {b.get('fecha','?')} {b.get('hora','')} · "
                f"{b.get('nombre','?')} · {b.get('pax','?')}pax · {b.get('producto','')[:60]}"
            )
        if len(unmatched) > 20:
            lines.append(f"\n*... y {len(unmatched) - 20} más.*")
except FileNotFoundError:
    lines.append("⚠️  `reservas_sin_agendar.json` no encontrado.")
except Exception as e:
    lines.append(f"⚠️  Error leyendo reservas_sin_agendar.json: `{e}`")

with open(summary_path, "a", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")

print("✅ Summary escrito.")
