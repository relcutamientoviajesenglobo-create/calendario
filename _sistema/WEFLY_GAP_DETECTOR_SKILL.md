---
name: wefly-gap-detector
description: Detector diario de reservas Turitop que AÚN NO están en Google Calendar (gap detection / reconciliación) para WE FLY — marcas Globos Aerostáticos Teotihuacán (M1/G465) y Vuelos en Globo MX (M2/V212). Ventana fija -7/+7 días desde hoy. Extrae bookings de ambas cuentas Turitop con chunking adaptativo (cap 100), los cruza contra Google Calendar usando cascade reserva_id → email → phone → name tokens, y genera reservas_sin_agendar.json + panel rojo en wefly-logistica.html. Activa con: gap detection, reservas sin agendar, reconciliación turitop, qué falta en calendario, wefly gap, revisar calendario vs turitop, o automáticamente vía wefly-gap-detector-daily.
---

# WE FLY Gap Detector (Turitop ↔ Google Calendar)

**Objetivo único:** detectar qué reservas de Turitop AÚN NO están en Google Calendar, en la ventana `hoy-7d → hoy+7d`. Cualquier otro reporte es ruido.

## Credenciales (.env)

`_sistema/.env` (nunca commitear):
```
TURITOP_M1_SHORT_ID=<short_id_marca_1>
TURITOP_M1_SECRET_KEY=<secret_key_marca_1>
TURITOP_M1_LABEL=Globos Aerostáticos Teotihuacán

TURITOP_M2_SHORT_ID=<short_id_marca_2>
TURITOP_M2_SECRET_KEY=<secret_key_marca_2>
TURITOP_M2_LABEL=Vuelos en Globo MX
```

Los valores reales están en `_sistema/.env` local (gitignored) y en
GitHub Secrets (`TURITOP_M1_SHORT_ID`, `TURITOP_M1_SECRET_KEY`,
`TURITOP_M2_SHORT_ID`, `TURITOP_M2_SECRET_KEY`) que alimentan el workflow
de GitHub Actions.

## Reglas operativas Turitop API

- Base prod: `https://app.turitop.com/v1`
- `POST /authorization/grant` con `{grant_type:"client_credentials", short_id, secret_key}` → access_token 60 min
- `POST /booking/getbookings` con `{access_token, bookings_date_from, bookings_date_to, limit:500}`
- **CAP DURO 100 bookings/response.** `limit`, `page`, `offset` ignorados.
- **Filtro semántico:** `bookings_date_from/to` filtra por CREACIÓN (date_prebooking), NO por fecha de evento. Abrir ventana de creación amplia (365 días) y filtrar client-side por `date_event_iso8601`.
- **Chunking bisección:** si chunk devuelve 100, partir a la mitad; repetir hasta < 100.
- **Egress sandbox bloquea `*.turitop.com` (403).** Fallback: ejecutar fetches via Chrome MCP (`javascript_tool` en pestaña `developers.turitop.com`).

## Workflow diario

### 1. Bajar bookings Turitop
Correr: `python3 "/sessions/zealous-upbeat-ramanujan/mnt/CALENDARIO WE FLY/wefly_turitop_client.py"`
→ Produce `turitop_bookings.json` normalizado. Si sandbox bloquea, usar fallback Chrome.

### 2. Filtrar a ventana -7/+7
```python
from datetime import date, timedelta
hoy = date.today()
w_from = (hoy - timedelta(days=7)).isoformat()
w_to   = (hoy + timedelta(days=7)).isoformat()
window = [b for b in bookings if w_from <= b["fecha_evento"] <= w_to and not b.get("archivada")]
```

### 3. Bajar calendar events (mismo rango)
```
gcal_list_events(
  calendarId="primary",
  timeMin="{w_from}T00:00:00-06:00",
  timeMax="{w_to}T23:59:59-06:00",
  condenseEventDetails=false,
  maxResults=500
)
```
Si el response excede tokens, el MCP lo escribe a disco automáticamente — parsear desde archivo.

### 4. Construir índice match
```json
{
  "rsv": ["IDs extraídos con /\\b([GV]\\d{3}-\\d{6}-\\d+)\\b/"],
  "em":  ["emails lowercased"],
  "ph":  ["últimos 10 dígitos de cada teléfono"],
  "nm":  { "YYYY-MM-DD": "títulos del día concatenados y normalizados" }
}
```
`norm(s)`: NFKD → strip diacríticos → lowercase → no-alfanumérico a espacio → collapse. Descartar cancelled y all-day DISPONIBILIDAD.

### 5. Matcher cascade
Por cada booking Turitop, en orden:
1. `b.reserva.toUpperCase()` ∈ `idx.rsv` → match
2. `b.cliente.email.toLowerCase()` ∈ `idx.em` → match
3. últimos 10 dígitos de `b.cliente.phone` ∈ `idx.ph` → match
4. tokens ≥3 chars del nombre normalizado: si ≥2 aparecen en `idx.nm[b.fecha_evento]` → match

Los NO matched → `reservas_sin_agendar`.

### 6. Output
Guardar `/sessions/zealous-upbeat-ramanujan/mnt/CALENDARIO WE FLY/reservas_sin_agendar.json`:
```json
{
  "generated_at":"YYYY-MM-DD","window":"... → ...",
  "total_turitop":0,"matched_en_calendar":0,"sin_agendar":0,
  "match_strategy":["reserva_id","email","phone_last10","name_tokens_por_dia"],
  "bookings":[{"reserva":"","marca":"M1|M2","fecha":"","hora":"","pax":0,"nombre":"","email":"","phone":"","producto":"","total":""}]
}
```

### 7. Panel en dashboard
Editar `wefly-logistica.html`, insertar después del header:
```html
<section id="sin-agendar" class="panel-alert">
  <h2>⚠️ RESERVAS SIN AGENDAR — <span id="sa-count">N</span></h2>
  <p class="window">Ventana: hoy-7d → hoy+7d · generado HH:MM</p>
  <table>...rows agrupados por fecha, HOY/MAÑANA en rojo...</table>
</section>
```
Estilos: fondo `#fff4f4`, borde-izq `#c1121f`, tipografía consistente.

### 8. Resumen al usuario
- Total gaps N reservas / M pax
- Desglose por día (solo días con gaps)
- Alerta HOY/MAÑANA
- Link `computer://` al json
- Link `computer://` al dashboard

## Fallback Chrome MCP (si sandbox bloquea api)

1. Pestaña en `https://developers.turitop.com/`
2. `javascript_tool` ejecuta:
```js
const grant = async (id,key)=>(await(await fetch('https://app.turitop.com/v1/authorization/grant',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({grant_type:'client_credentials',short_id:id,secret_key:key})
})).json()).access_token;
```
3. getBookings con chunking bisección → `window.__TT_FULL__`
4. Filtrar evento-fecha → `window.__TT_WIN__`
5. Push `window.__CAL_IDX__` desde disco (JSON <10KB cabe en un `javascript_tool` input)
6. Correr matcher en browser → `window.__SIN_AGENDAR__`
7. Extraer paginadamente (slices de 900 chars; display cap ~1000)
8. Reconstruir JSON con Write local

## Gotchas

- Reserva pattern: `[GV]\d{3}-\d{6}-\d+` (ej G465-260407-1). Último segmento es contador, no siempre 1.
- Fecha evento: usar `date_event_iso8601`, no otros campos de fecha.
- `archivada:true` → excluir.
- Teléfonos: normalizar siempre con `.replace(/\D/g,'').slice(-10)`.
- Calendar events con formato corto `"Np nombre"` sin contactos → el name-tokens matcher es crítico para evitar falsos positivos.
- Bookeo: credenciales requieren email a `api@bookeo.com` (NO self-service; bookeo.force.com DNS está caído).
- Viator: requiere Supplier dashboard access del user.
- TZ: America/Mexico_City (UTC-06:00).
- Calendar primario: `weflymx@gmail.com`.

## Criterio de éxito
1. `reservas_sin_agendar.json` con `generated_at == hoy`
2. Dashboard con panel "SIN AGENDAR" actualizado
3. Usuario recibió resumen + link
