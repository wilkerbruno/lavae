#!/usr/bin/env bash
set -e

# Sempre entra na raiz do repo primeiro, não importa de onde o "wsl" foi
# aberto (esse é o bug recorrente: abrir o wsl de dentro de C:\Users\wilke
# ou de apps\api faz o eas/git rodar no lugar errado). Ajuste o caminho
# abaixo se a pasta mudar de lugar.
cd /mnt/c/Users/wilke/Documents/github/lavajato

echo "==> Repo: $(pwd)"

# traz as correções mais recentes — só funciona se você já deu commit + push
# pela pasta do projeto (PowerShell/GitHub Desktop) antes de rodar isso.
git pull origin main

pnpm install

# limpa a pasta android pra regenerar do zero com os ícones/config atuais
rm -rf apps/mobile/android

# restringe a 1 arquitetura (evita o erro de "sem espaço em disco")
export ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a

cd apps/mobile
eas build --local --platform android --profile preview

APK="$(ls -t build-*.apk | head -1)"
echo "==> APK gerado: $APK"

# copia o APK pra área de trabalho (WSL e Windows)
cp "$APK" ~/Desktop/LavaJatoOne.apk
cp "$APK" "/mnt/c/Users/wilke/Desktop/LavaJatoOne.apk"

echo "==> Copiado para a Área de Trabalho."
