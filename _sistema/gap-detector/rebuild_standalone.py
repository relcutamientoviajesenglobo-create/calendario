#!/usr/bin/env python3
"""
Regenera wefly-logistica-STANDALONE.html embebiendo:
  1. reservas_sin_agendar.json  (inline, reemplaza fetch)
  2. Desactiva el botón refresh (modo standalone)
"""
import json
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent.parent  # CALENDARIO WE FLY/

html_path = OUT_DIR / "wefly-logistica.html"
json_path = OUT_DIR / "reservas_sin_agendar.json"
out_path  = OUT_DIR / "wefly-logistica-STANDALONE.html"

html = html_path.read_text()
data = json.loads(json_path.read_text())

# 1. Embed reservas JSON (replace fetch)
embed = json.dumps(data, ensure_ascii=False)
old_fetch = "const r = await fetch('reservas_sin_agendar.json?ts='+Date.now());"
new_fetch = f"const d = {embed}; const r = {{ok:true,json:async()=>d}};"
html2 = html.replace(old_fetch, new_fetch)

# 2. Disable refresh button (standalone mode)
old_refresh = "const res = await fetch('./wefly-data.json?t=' + Date.now(), {cache:'no-store'});"
new_refresh = "throw new Error('Modo STANDALONE: datos embebidos. Para datos en vivo usa la versión con JSON separados.');"
html2 = html2.replace(old_refresh, new_refresh)

out_path.write_text(html2)

ok_embed = old_fetch not in html2
ok_refresh = old_refresh not in html2
size_kb = out_path.stat().st_size / 1024

print(f"✅ STANDALONE regenerado: {size_kb:.0f} KB")
print(f"   reservas embebidas: {ok_embed}")
print(f"   refresh desactivado: {ok_refresh}")
print(f"   sin_agendar: {data.get('total_sin_agendar', '?')}")
print(f"   generado: {data.get('generated_at', '?')}")
