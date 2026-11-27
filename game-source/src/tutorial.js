export const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({
    title: 'Conheça a laje',
    description: 'Antes de empinar, posicione seu pipeiro. Caminhe pela laje, escolha um espaço livre e alinhe o personagem para o céu aberto.',
    hint: 'WASD ou as setas movimentam. SHIFT faz correr. No celular, use o direcional e o botão CORRER.'
  }),
  Object.freeze({
    title: 'Coloque a pipa no alto',
    description: 'Com a pipa na mão, dê três tapas com um pequeno intervalo entre eles. Uma corrida antes do lançamento ajuda a ganhar impulso.',
    hint: 'Clique em DAR TAPA ou pressione ESPAÇO/E três vezes. No celular, toque no botão de lançamento.'
  }),
  Object.freeze({
    title: 'Controle o voo e a linha',
    description: 'A e D guiam o bico. PUXAR recolhe a linha; DAR LINHA libera aos poucos. Use DESCARGA RÁPIDA para abrir distância e DISBICAR para uma correção forte.',
    hint: 'Puxe sem exagerar: acompanhe a tensão e o vento no painel antes de dar outra socada.'
  }),
  Object.freeze({
    title: 'Entre no RELO com técnica',
    description: 'Observe a linha rival e o ponto de cruzamento. A largada no tempo certo melhora seu ataque; repetir o mesmo movimento facilita a defesa do adversário.',
    hint: 'Aproxime as linhas de verdade. A física de contato decide o RELO; não basta ficar perto da pipa.'
  }),
  Object.freeze({
    title: 'Apare e resgate',
    description: 'Quando uma pipa avoar, chegue até a rabiola. Acerte cada trava do desembolo e depois recolha a pipa manualmente até sua mão.',
    hint: 'A captura depende do contato físico com a rabiola. Cinco acertos liberam o recolhimento; três erros deixam a pipa escapar.'
  }),
  Object.freeze({
    title: 'Oficina, garagem e online',
    description: 'Na oficina, os materiais escolhidos alteram velocidade, giro, estabilidade e desgaste. Na garagem, repare suas pipas. No online, a sala mostra apenas pessoas conectadas de verdade.',
    hint: 'Use O/Oficina, Casa/Garagem e Online. O botão 🎓 abre este guia novamente quando precisar.'
  })
]);

export function getTutorialStep(index) {
  if (!Number.isInteger(index) || index < 0 || index >= TUTORIAL_STEPS.length) return null;
  return TUTORIAL_STEPS[index];
}
