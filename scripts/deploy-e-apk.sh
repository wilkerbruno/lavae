#!/usr/bin/env bash
# ============================================================================
# Script de deploy completo: instalar dependências, subir API+painel pro
# EasyPanel (via git push) e gerar um novo APK do app mobile (via EAS Build).
#
# Rode a partir da RAIZ do repositório (onde está este arquivo, dentro de
# scripts/). Em Windows, use o Git Bash (ou WSL) pra rodar um .sh — num
# PowerShell puro, copie e cole os blocos de comando um por um em vez de
# executar o arquivo direto.
#
# Alguns passos são INTERATIVOS de propósito (login no EAS, confirmar o
# deploy no painel do EasyPanel) — o script para e espera você antes de
# seguir pra próxima etapa.
# ============================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

pausar() {
  read -r -p ">>> $1 (ENTER pra continuar, Ctrl+C pra parar aqui) "
}

echo "============================================================"
echo "1) Instalando dependências (pnpm install)"
echo "============================================================"
pnpm install

echo ""
echo "============================================================"
echo "2) Recompilando o pacote compartilhado (packages/shared)"
echo "============================================================"
pnpm run build:shared

echo ""
echo "============================================================"
echo "3) Conferindo que tudo compila (tsc) antes de subir"
echo "============================================================"
pnpm --filter @lavajato-app/api exec tsc --noEmit
pnpm --filter @lavajato-app/mobile exec tsc --noEmit
pnpm --filter @lavajato-app/admin-web exec tsc --noEmit
echo "tsc OK nos três projetos."

echo ""
echo "============================================================"
echo "4) Git: revisar e subir as mudanças pro GitHub"
echo "============================================================"
git status --short
echo ""
pausar "Confira a lista de arquivos acima."

git add -A
git commit -m "feat: aviso de vencimento por push, popup de renovacao e cartoes salvos"
git push origin main

echo ""
echo "============================================================"
echo "5) EasyPanel: fazer o redeploy da API e do painel"
echo "============================================================"
echo "O código já está no GitHub (origin/main)."
echo "- Se os serviços da API e do painel (apps/admin-web) tiverem"
echo "  auto-deploy ligado no EasyPanel, o build já deve começar sozinho"
echo "  em alguns segundos/minutos."
echo "- Se não, entre no painel do EasyPanel e clique em 'Deploy' em cada"
echo "  um dos dois serviços."
echo "- Depois, confira os Logs de cada serviço pra confirmar que o build"
echo "  terminou sem erro e o container subiu."
pausar "Confirme que os dois deploys no EasyPanel terminaram com sucesso."

echo ""
echo "============================================================"
echo "6) Gerando o novo APK (EAS Build)"
echo "============================================================"
cd "$RAIZ/apps/mobile"

echo ""
echo "Login na sua conta Expo (abre um link/prompt — siga as instruções):"
npx eas-cli login

echo ""
echo "Configurando o projeto no EAS (só preenche o projectId de verdade em"
echo "app.json na primeira vez que roda — sem isso, notificação push não"
echo "funciona; se já tiver rodado antes, esse comando não faz nada):"
npx eas-cli init

echo ""
echo "Gerando o .apk (perfil 'preview', já configurado em eas.json)..."
npx eas-cli build --platform android --profile preview

echo ""
echo "============================================================"
echo "Pronto!"
echo "============================================================"
echo "Quando o build terminar (alguns minutos, roda nos servidores da Expo),"
echo "o link pra baixar o .apk aparece aqui no terminal e também em"
echo "https://expo.dev -> seu projeto -> Builds."
