#!/bin/bash
DIR="$HOME/Documents/Claude/Projects/CALENDARIO WE FLY"
KEY="$DIR/_sistema/deploy/wefly_deploy_key"

chmod 600 "$KEY"
export GIT_SSH_COMMAND="ssh -i '${KEY}' -o StrictHostKeyChecking=no"

cd "$DIR"

# Limpiar git anterior si existe
rm -rf .git

# Init fresco
git init
git branch -m main
git config user.email "weflymx@gmail.com"
git config user.name "WE FLY"
git remote add origin git@github.com:relcutamientoviajesenglobo-create/calendario.git

# Add archivos del dashboard
git add index.html reservas_sin_agendar.json
[ -f wefly-data.json ] && git add wefly-data.json
git commit -m "Dashboard WE FLY — gap detector v2 $(date '+%Y-%m-%d %H:%M')"

# Push
git push -u origin main --force 2>&1

echo ""
echo "✅ Push completado — puedes cerrar esta ventana"
read -p "Presiona Enter para cerrar..."
