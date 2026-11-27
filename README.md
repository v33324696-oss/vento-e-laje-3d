# Vento & Laje 3D

Jogo 3D de pipas em Three.js + Vite, com 5 mapas, 13 modelos de pipa, 13 opções de linha, controles para celular e computador e salas multiplayer com HTTP + WebSocket no mesmo servidor.

## Publicação no Render

O repositório inclui `render.yaml` na raiz. O build remonta o código-fonte a partir dos blocos `source.part.*`, extrai o projeto em `app/`, instala as dependências, compila os arquivos do Vite e inicia o servidor HTTP/WebSocket.

1. Abra o [Blueprint do Render](https://dashboard.render.com/blueprint/new?repo=https%3A%2F%2Fgithub.com%2Fv33324696-oss%2Fvento-e-laje-3d).
2. Conecte o GitHub, selecione o serviço `vento-e-laje-3d`, confira o plano gratuito e clique em **Apply**.
3. Aguarde o build e o deploy ficarem `Live`. O endereço público será exibido no painel do Render.

O plano gratuito pode suspender após inatividade; o modo online só funciona enquanto o servidor estiver ativo. As salas ficam na memória e são encerradas quando a instância reinicia ou dorme.

## Desenvolvimento local

O código fonte foi guardado em blocos Base64 para facilitar o upload. Na raiz deste repositório, execute:

```bash
cat source.part.* | base64 -d > game-source.tar.gz
tar -xzf game-source.tar.gz
npm ci
npm run dev:all
```

O projeto requer Node.js 22.12 ou superior.

## Estado e limitações

Os quatro testes automatizados da mecânica de RELO passaram. O áudio é procedural, não gravação idêntica de campo. A disputa online é uma simulação de jogo com geometria aproximada da curva da linha; não representa física exata nem propriedades reais de materiais cortantes. O plano grátis não oferece disponibilidade 24/7.
