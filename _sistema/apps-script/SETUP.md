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
   - Descripción: `Dashboard API v1`
   - Ejecutar como: **"Yo (weflymx@gmail.com)"**
   - Quién tiene acceso: **"Cualquier persona"**
4. Click en **"Implementar"**
5. Te pedirá permisos → **"Autorizar"** → Selecciona weflymx@gmail.com
6. Si dice "app no verificada" → Click en "Avanzado" → "Ir a WE FLY Dashboard API (no seguro)"
7. Copia la **URL de la web app** (se ve como: `https://script.google.com/macros/s/AKfycbx.../exec`)

## Paso 3: Pegar la URL en el dashboard

1. Abre `index.html` en un editor de texto
2. Busca esta línea (cerca de la línea 1048):
   ```
   const APPS_SCRIPT_URL = '';
   ```
3. Pega tu URL entre las comillas:
   ```
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
   ```
4. Guarda el archivo
5. Haz push a GitHub para que Render lo despliegue

## Paso 4: Probar

1. Abre el dashboard en el navegador
2. Click en **"Actualizar en vivo"**
3. Debería mostrar "Leyendo 9 calendarios + Gmail…" y después los datos frescos

## Notas

- La primera vez tarda ~15-20 segundos (Google tiene que "calentar" el script)
- Las siguientes veces tarda ~8-12 segundos
- El script lee los 9 calendarios + correos Bookeo/Viator en cada click
- No tiene costo (Google Apps Script es gratis para cuentas Gmail)
- Límite: ~20,000 llamadas/día (más que suficiente para 6 personas)
- Si cambias el código del script, necesitas hacer un NUEVO deploy (Implementar → Nueva implementación)

## Si algo falla

- Abre https://script.google.com → tu proyecto → "Ejecuciones" para ver logs
- Si da timeout: puede ser que un calendario tenga demasiados eventos. El script ya maneja errores por calendario individual.
- Si da error de permisos: re-autoriza el script (Implementar → Gestionar implementaciones → editar permisos)
