# Vento & Laje 3D

Jogo 3D de pipas com modo solo e salas online usando HTTP + WebSocket no mesmo servidor.

## Publicação no Render

O repositório contém `render.yaml` e `game-source.zip`. O Blueprint extrai o código do jogo para `app/`, instala as dependências, compila os assets com Vite e inicia o servidor HTTP/WebSocket Node na mesma porta pública.

## Desenvolvimento local

Extraia `game-source.zip`, entre na pasta extraída e execute `npm ci` e `npm run dev:all`.

## Deploy

Abra o Blueprint do Render usando este repositório: https://dashboard.render.com/blueprint/new?repo=https%3A%2F%2Fgithub.com%2Fv33324696-oss%2Fvento-e-laje-3d

O serviço utiliza o plano gratuito; ele pode suspender após inatividade. O modo online só funciona enquanto o servidor estiver ativo.
