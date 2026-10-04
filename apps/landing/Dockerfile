# Site de divulgação do lavaê (lavae.store, domínio raiz): página estática, sem
# build (sem Node/pnpm), só HTML/CSS/JS. No EasyPanel, ao criar o serviço:
#   - Build method: Dockerfile
#   - Build context / Root directory: a raiz do repositório
#   - Dockerfile path: apps/landing/Dockerfile
#   - Domínio: lavae.store (e www.lavae.store, se quiser)
#   - Porta do container: 80
# O APK fica em apps/landing/public/downloads/lavae-latest.apk (ver README lá).
FROM nginx:alpine
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/public /usr/share/nginx/html
EXPOSE 80
