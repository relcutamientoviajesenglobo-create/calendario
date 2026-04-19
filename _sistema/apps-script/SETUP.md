# Setup — Google Apps Script para WE FLY Dashboard

Tiempo estimado: 5 minutos. Una sola vez.

## Paso 1: Crear el script

1. Abre **https://script.google.com** con la cuenta **weflymx@gmail.com**
2. Click en **"Nuevo proyecto"**
3. Ponle nombre: `WE FLY Dashboard API`
4. Borra todo el código que aparece
5. Pega TODO el contenido del archivo `Code.gs` que está en esta misma carpeta
6. Guarda (Ctrl+S)

## Paso 2: Deploy como Web App

1. Click en **"Implementar"** → **"Nueva implementación"**
2. En tipo, selecciona **"Aplicación web"**
3. Configurar:
   - Descripción: `Dashboard API v2 (events_flat)`
   - Ejecutar como: **"Yo (weflymx@gmail.com)"**
   - Quién tiene acceso: **"Cualquier persona"**
4. Click en **"Implementar"**
5. Te pedirá permisos → **"Autorizar"** → Selecciona weflymx@gmail.com
6. Si dice "app no verificada" → Click en "Avanzado" → "Ir a WE FLY Dashboard API (no seguro)"
7. Copia la **URL de la web app** (se ve como: `https://script.google.com/macros/s/AKfycbx.../exec`)

## Paso 3: Pegar URL en TRES lugares

### A. Para el dashboard (index.html)
1. Abre `index.html` y busca `APPS_SCRIPT_URL = ''`
2. Pega la URL entre las comillas
3. Commit + push

### B. Para el gap detector (.env)
Añadir al archivo `_sistema/.env`:
```
APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbx.../exec
```

### C. (Opcional) Como variable de shell
```bash
export APPS_SCRIPT_URL='https://script.google.com/macros/s/AKfycbx.../exec'
```

## Paso 4: Probar los 2 endpoints

### Endpoint 1 — Dashboard (default)
```
https://script.google.com/macros/s/.../exec
```
Retorna JSON completo con events + emails Gmail + stats.

### Endpoint 2 — Flat events (para gap detector)
```
https://script.google.com/macros/s/.../exec?action=events_flat&from=2026-04-01&to=2026-05-01
```
Retorna array plano: `[{date, summary, desc, calendar, emails, phones}, ...]`
**Con emails/phones PRE-EXTRAÍDOS** del desc completo (sin truncar).
**Nombres canónicos:** `PRIMARY`, `GAT`, `VGMX`, `BOOKEO`, `VIATOR`, `GAMX_MONSE`, `RECEPCION`, `BOKUN`, `SOLO_BOKUN`.

## Paso 5: Regenerar calendar_events.json

Con la URL configurada en `.env`:
```bash
cd "/Users/gerencia/Documents/Claude/Projects/CALENDARIO WE FLY/_sistema/gap-detector"
python3 build_calendar_events.py                       # ventana hoy-7d..hoy+30d
python3 build_calendar_events.py --from 2026-04-01 --to 2026-05-15
```

Verifica que reporte los 9 calendarios con sus eventos.

## Paso 6: Correr gap detector

```bash
python3 gap_detector.py --from 2026-04-01 --to 2026-05-01          # modo normal
python3 gap_detector.py --from 2026-04-01 --to 2026-05-01 --debug  # diagnóstico
```

El gap_detector v3 ABORTA si detecta que `calendar_events.json`:
- No cubre la ventana de bookings
- No incluye los calendarios críticos (PRIMARY, GAT, VGMX, BOOKEO)
- No tiene campo `calendar` por evento

Esto previene falsos positivos masivos.

## Notas

- La primera vez tarda ~15-20 segundos (Google tiene que "calentar" el script)
- Las siguientes veces tarda ~8-12 segundos
- El script lee los 9 calendarios + correos Bookeo/Viator en cada click
- No tiene costo (Google Apps Script es gratis para cuentas Gmail)
- Límite: ~20,000 llamadas/día
- Si cambias el código del script, necesitas hacer un NUEVO deploy (Implementar → Nueva implementación)

## Si algo falla

- Abre https://script.google.com → tu proyecto → "Ejecuciones" para ver logs
- Si da timeout: puede ser que un calendario tenga demasiados eventos. El script ya maneja errores por calendario individual.
- Si da error de permisos: re-autoriza el script (Implementar → Gestionar implementaciones → editar permisos)
- Si `events_flat` no retorna GAT events: mirar los logs del proyecto. Apps Script tiene timeout interno de ~6 min, pero GAT debería caber sobrado en 30 días de ventana.
