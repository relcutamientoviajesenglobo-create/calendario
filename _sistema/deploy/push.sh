#!/bin/bash
# WE FLY Dashboard — Push a GitHub
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

# Add solo los 3 archivos del dashboard
git add index.html wefly-data.json reservas_sin_agendar.json
git commit -m "Dashboard WE FLY — gap detector $(date '+%Y-%m-%d %H:%M')"

# Push
git push -u origin main --force 2>&1

echo ""
echo "✅ Push completado"
