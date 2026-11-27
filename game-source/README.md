# Vento & Laje 3D — multiplataforma e pronto para hospedagem

Jogo 3D em Three.js + Vite com interface adaptada a computador, celular e tablet, personagem explorável, oficina e salas multiplayer por WebSocket.

## Rodar no computador

Requer Node.js 22 ou compatível com Vite 8.

```bash
npm install
npm run dev:all
```

Abra `http://localhost:5173`. O site de desenvolvimento usa o Vite na porta 5173 e o WebSocket local em `ws://localhost:8081/ws`.

Para testar o build de produção localmente:

```bash
npm install
npm run build
npm start
```

Abra `http://localhost:10000`. O servidor Node serve o jogo e o WebSocket em `/ws` no mesmo endereço.

## Controles

### Computador
- WASD ou setas: controlar pipa; no modo Explorar, andar com o personagem.
- Shift: correr no modo Explorar.
- Espaço/clique: socar.
- W/S: puxar/dar linha.
- A/D: guiar; Q/E: disque; C: câmera; V: explorar; E: escolher local de voo.

### Celular e tablet
- Botões grandes de GUIAR, PUXAR, DAR LINHA e SOCAR ficam na parte inferior.
- Ao tocar em Explorar, aparece um direcional com quatro botões; CORRER e EMPINAR AQUI ficam do lado direito.
- A interface respeita as áreas seguras do iPhone e se reorganiza em modo retrato e paisagem.
- Pode ser instalado na tela inicial como PWA depois de abrir o endereço HTTPS.

## Oficina de pipas e linhas

A oficina tem 13 formatos de pipa — incluindo raia, murcha, papagaio, delta, capucheta, peixão e rokkaku — além de estampas e 13 opções de linha inspiradas em materiais e famílias reais: algodão nº 10 e nº 24, nylon multifilamento e monofilamento, poliéster trançado/fino, Dacron, algodão encerado, aramida e linha tradicional. Os atributos de desempenho são balanceamento fictício do jogo, não recomendações de uso real.

## Multiplayer na internet

O projeto agora usa um único endereço para o site e as salas WebSocket. Jogadores de Android, iPhone e computador podem entrar usando a mesma URL e o mesmo código da sala. O servidor mantém até 12 conexões por sala e envia os estados de jogador e pipa.

As salas ficam apenas na memória do processo. Se a instância reiniciar ou dormir, os jogadores são desconectados e as salas desaparecem. A física de corte/colisão entre jogadores ainda não é autoritativa no servidor; o multiplayer atual sincroniza presença, personagem e estado visual da pipa.

## Hospedar sem pagar no Render

O arquivo `render.yaml` já configura um Web Service gratuito com Node.js, compilação do site e WebSocket no mesmo host.

1. Crie um repositório no GitHub e envie **o conteúdo desta pasta** para ele (incluindo `render.yaml`).
2. Entre em [Render](https://render.com/) e conecte o GitHub.
3. No painel, use **New → Blueprint** e selecione o repositório.
4. Confirme o serviço `vento-e-laje-3d` e o plano **Free**.
5. Quando o deploy terminar, abra a URL `https://vento-e-laje-3d.onrender.com` que o Render mostrar.
6. Compartilhe essa URL; todos os jogadores usam o mesmo endereço. O servidor WebSocket será detectado automaticamente.

O deploy exige uma conta Render/GitHub e autorização feita pelo dono da conta. Não existe forma de publicar em nome do usuário sem essa autenticação.

### Limites do plano grátis

O Render Free pode adormecer após 15 minutos sem requisições/mensagens WebSocket e pode levar cerca de um minuto para acordar. O serviço também tem 750 horas gratuitas mensais por workspace e sistema de arquivos temporário. Por isso, é indicado para testes e comunidade pequena, não para prometer 24/7 ou guardar progresso permanente. Consulte os limites atuais antes de abrir a comunidade: https://render.com/docs/free

## Áudio e fidelidade

A versão atual mantém áudio procedural de vento, papel, carretilha, linha e estalos. Isso dá resposta dinâmica ao jogo, mas **não pode ser chamado de idêntico à vida real**. Para fidelidade acústica máxima, use gravações reais próprias ou licenciadas. A pasta `public/audio/README.txt` lista os tipos de captação recomendados.

## Limites atuais

- Os nomes das linhas representam materiais/famílias reconhecíveis; valores de corte e arrasto são apenas parâmetros de gameplay.
- O serviço gratuito não garante disponibilidade ininterrupta.
- O multiplayer atual sincroniza aparência e movimento, mas não executa duelos de corte com física autoritativa no servidor.
- É necessária conexão com a internet para salas online; a instalação PWA não elimina essa necessidade.


## Regras de relo e disputa online (v1.2.0)

A disputa de linhas agora usa um modelo de jogo compartilhado em `src/relo.js`. O resultado considera: qualidade do cruzamento em 3D, ponto de contato ao longo de cada linha, tensão, movimento, manobras e tempo da largada. Uma entrada ruim recebe um fator menor; uma largada fora da janela não ganha o bônus de timing.

### Controles da disputa

- **Dar linha (S / botão DAR LINHA):** descarrega a linha. O início do comando também tenta uma largada; o bônus depende da proximidade e do ângulo do cruzamento.
- **Puxar (W / botão PUXAR):** recolhe linha e aumenta a tensão.
- **Socar (Espaço / botão SOCAR):** impulso curto para reposicionar a pipa.
- **Disque (Q/E):** manobra lateral com recarga.

### Online

O cliente envia oito amostras da curva 3D da linha. O servidor compara as polilinhas, calcula o cruzamento e decide o resultado; todos na sala recebem o mesmo evento `relo-result`. As linhas online são aproximações discretizadas da curva visual, não uma simulação física de materiais reais.

### Testes

Execute `npm test` para verificar a geometria de cruzamento, o ponto de contato, a vantagem da largada bem cronometrada e a penalidade de uma entrada invertida.

**Segurança:** a potência das linhas é um atributo fictício de balanceamento. O jogo não fornece receitas, materiais ou instruções para fabricar linhas cortantes.
