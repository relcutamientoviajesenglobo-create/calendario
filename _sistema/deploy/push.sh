#!/bin/bash
# WE FLY Dashboard — Push a GitHub (modo normal, sin force-reinit)
# El GitHub Action se encarga del refresh automático cada 2h.
# Este script solo para cambios manuales (editar index.html, etc.)
set -e

DIR="$HOME/Documents/Claude/Projects/CALENDARIO WE FLY"
KEY="$DIR/_sistema/deploy/wefly_deploy_key"

if [ -f "$KEY" ]; then
  chmod 600 "$KEY"
  export GIT_SSH_COMMAND="ssh -i '${KEY}' -o StrictHostKeyChecking=no"
fi

cd "$DIR"

# Add todos los cambios que no estén en .gitignore
git add -A

# Commit solo si hay cambios
if git diff --cached --quiet; then
  echo "⚠️  Sin cambios para commitear."
  exit 0
fi

git commit -m "Manual: $(date '+%Y-%m-%d %H:%M')"

# Push normal (NO --force). Mantiene historia.
git push origin main

echo ""
echo "✅ Push completado — Render redesplegará automáticamente."
