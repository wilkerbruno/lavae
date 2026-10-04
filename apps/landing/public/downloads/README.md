# APK para download

O botão "Baixar o app" da landing page aponta para:

    /downloads/lavae-latest.apk

Sempre que gerar um novo build, copie o .apk resultante para cá com ESSE MESMO
NOME (lavae-latest.apk) e faça commit + push. O link da página nunca muda, só
o conteúdo do arquivo.

Exemplo (WSL, na raiz do repositório):

    cp ~/Desktop/lavae.apk apps/landing/public/downloads/lavae-latest.apk
    git add apps/landing/public/downloads/lavae-latest.apk
    git commit -m "chore: atualiza apk de download da landing page"
    git push

Se o APK for baixado do EAS (build na nuvem), baixe o arquivo pelo link do build
e renomeie para lavae-latest.apk antes de copiar.
Se o arquivo ficar grande, considere Git LFS para esse caminho.
