# Auditoría de errores en emails — 2026-04-08

**Scope:** cuentas `weflymx@gmail.com` (/u/2/) y `relcutamientoviajesenglobo@gmail.com` (/u/1/), últimos 21 días.

---

## 🔴 CRÍTICOS (requieren acción inmediata)

### 1. Bookeo — typo en email de Gabriel Romano (reserva 01 abr, HOY en -7d)
- **Reserva Bookeo:** 4 mar 2026
- **Cliente:** Gabriel Romano — 2 pax, vuelo **miércoles 01 abril 2026 04:30**
- **Teléfono móvil:** +54 381 1558 12253
- **Email registrado en Bookeo:** `gabrielromamo@hotmail.com` ← **TYPO (falta la 'n')**
- **Email real del cliente:** `gabrielromano@hotmail.com` (confirmado: el cliente escribió el 31 mar 2026 15:04)
- **Impacto:**
  - Los emails automáticos de confirmación, recordatorio y post-vuelo enviados por Bookeo **rebotaron** con error 550 "mailbox unavailable".
  - El cliente contactó manualmente para confirmar. Ya existe un hilo directo.
  - El gap detector de Turitop/Bookeo no matchea por email porque el email en el sistema está mal escrito.
- **Acción requerida:**
  1. Entrar a Bookeo → buscar reserva de Gabriel Romano del 4 mar → editar email a `gabrielromano@hotmail.com`
  2. Verificar en Turitop si también tiene typo y corregir
  3. El vuelo ya pasó (era el 1 abr) — confirmar que voló sin incidentes

### 2. Ahrefs Site Audit — crawl fallando diariamente (Vuelos en Globo MX)
- **Periodo afectado:** desde 26 mar 2026 hasta HOY (8 abr) = **14 días consecutivos de crawl fallido**
- **Últimos emails:** 8 abr 3:55 am, 7 abr, 2 abr, 1 abr, 31 mar, 30 mar, 29 mar, 28 mar, 27 mar, 26 mar
- **Dominio afectado:** Vuelos en Globo MX (vuelosenglobomx / volarenglobo / similar)
- **Impacto:** Ahrefs no puede analizar el sitio → 0 datos SEO frescos → afecta el ranking a largo plazo
- **Causa probable:** robots.txt bloqueando AhrefsBot, firewall/Cloudflare, o sitio caído durante las horas de crawl
- **Acción requerida:**
  1. Verificar `robots.txt` del dominio de Vuelos en Globo MX — permitir `AhrefsBot`
  2. Si usa Cloudflare: revisar reglas de WAF y whitelistear Ahrefs
  3. Ver detalles en primer email de Ahrefs (el "crawl error" del 7 abr)

---

## 🟠 IMPORTANTES (revisar en los próximos días)

### 3. Viator cancellation — Molly Hungate (16 may 2026)
- **Referencia:** BR-1381108497
- **Producto:** Teotihuacán Hot Air Balloons from We Fly — ALL INCLUSIVE 04:30
- **Pax:** 2 adultos
- **Fecha cancelada:** Sat, 16 may 2026
- **Recibido:** 4 abr 2026
- **Acción:** Si ese vuelo está en Google Calendar, borrarlo. Está fuera de la ventana -7/+7 actual pero aparecerá en ella a partir del 9 may.

### 4. Viator Trust & Safety — Weichao Wang (29 mar 2026, ya pasó)
- **Referencia:** BR-1378145803
- **Producto:** Balloon Flight + Cave Breakfast + Pick Up
- **Motivo:** Cancelada por sospecha de fraude de pago
- **Nota:** Viator garantiza el pago al operador
- **Acción:** Ninguna — histórico, ya resuelto

### 5. Viator cancellation — Allison Taylor (30 mar 2026, ya pasó)
- **Referencia:** BR-1376136337
- **Pax:** 2 adultos
- **Acción:** Ninguna — histórico

### 6. Bókun Marketplace — Propuesta rechazada (1 abr)
- **Seller:** Travelportal Travel Inc
- **Acción:** Revisar si es un canal que interesaba; no crítico

---

## 🟡 ISSUES SEO/TÉCNICOS (cuenta relcutamiento, 14 días)

Consolidados por urgencia. Todos de Ahrefs/Semrush sobre los 3 sitios de WE FLY:

| Sitio | Problema | Cantidad | Fecha |
|---|---|---|---|
| Vuelosenglobomx | 4XX pages (404/410 rotos) | **133 URLs** | 31 mar |
| Vuelos en Globo MX | Slow page | 105 URLs | 5 abr |
| Wefly | Page has links to redirects | 97 URLs | 31 mar |
| Vuelos en Globo MX | Page and SERP titles do not match | 56 URLs | 4 abr |
| Vuelos en Globo MX | Pages to submit to IndexNow | 44 URLs | 6 abr |
| Vuelos en Globo MX | Hreflang and HTML lang mismatch | 6 URLs | 7 abr |
| Wefly | Slow page | 6 URLs | 7 abr |
| Vuelosenglobomx | HTTPS/HTTP mixed content | 1 URL | 3 abr |
| SEO CDMX | 6 New Types of Issues (Semrush) | — | 31 mar |

**Mayor prioridad:** las 133 URLs 4XX en Vuelosenglobomx — son links rotos que destruyen autoridad y experiencia de usuario. Siguiente: las 56 páginas con title mismatch (las reescribe Google automáticamente en SERP si no coinciden con el query).

---

## Resumen ejecutivo

- **1 bug urgente en CRM:** typo en email de Gabriel Romano en Bookeo → confirmaciones bouncing (el vuelo ya pasó, corregir para evitar que se repita con reservas futuras del mismo cliente)
- **1 bloqueo de crawler activo:** Ahrefs no puede indexar Vuelos en Globo MX desde hace 14 días — revisar robots.txt / WAF
- **3 cancelaciones de Viator** (1 futura: Molly Hungate 16 may)
- **SEO debt considerable** en Vuelosenglobomx (133 URLs rotas, 105 lentas, 56 títulos mal)
- **Ruido informativo:** ~20 promos de Petco, 3 newsletters de Viator, 3 promos de Pinterest, 1 newsletter de TikTok Ads — no son errores
