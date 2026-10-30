# ConstelacaoVR

Constelação: jogo de tabuleiro em VR para o Meta Quest 3 no navegador (WebXR), que também joga no PC.
O tabuleiro é o céu em volta de você: você fica num mirante redondo no meio de uma esfera de estrelas
(olha para cima, para os lados e para trás). Na sua vez, liga duas estrelas vizinhas com um traço de
luz; quem desenha o terceiro lado de um triângulo fica com ele (pinta da sua cor) e joga de novo.
10 constelações cada vez maiores, 3 adversários com personalidade. Tudo em português. HTML + JS puro +
Three.js r170 (em `vendor/three`).

## Como rodar / jogar

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8825` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache.

**No Quest:** `python serve.py --https` e abrir no navegador do óculos o endereço que ele mostra
(`https://<IP do PC>:8443`, aceitar o aviso de certificado), depois "Entrar em VR". Quando publicado:
`https://parappathe.github.io/ConstelacaoVR/` (`python publicar.py ConstelacaoVR` na pasta raiz).
(Ainda não publicado.)

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Desenhar um traço | Apontar o raio entre duas estrelas vizinhas (o traço acende) e gatilho | Apontar entre duas estrelas e clicar |
| Ligar estrela a estrela | Gatilho em cima de uma estrela, apontar a vizinha e soltar | Arrastar de uma estrela até a vizinha |
| Mãos (sem controle) | Apontar com a mão e fazer pinça (pinça na estrela e soltar na vizinha também liga) | |
| Olhar em volta | Virar o corpo; manche esquerda/direita vira 30° | Arrastar no vazio, setas ou WASD; roda: zoom |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar e gatilho | Clique |
| FPS | Menu → FPS | Tecla F |

Cor do traço apontado (opção "Cor nos traços", ligada por padrão): verde fecha triângulo, amarelo
entrega triângulo para o adversário (deixa um triângulo com 2 lados), branco é neutro.

Quando o adversário joga, um cometa da cor dele vai até o traço antes de desenhar. Se isso estiver fora
do seu campo de visão, uma seta na borda da vista aponta para lá (some quando você olha). No começo de
cada céu a seta (dourada) aponta para o meio da constelação; no PC a câmera vira sozinha.

### Regras

- Na vez, desenha-se um traço entre duas estrelas vizinhas (lados da malha de triângulos).
- Quem desenha o terceiro lado de um triângulo ganha o triângulo e joga de novo (um traço pode fechar
  dois de uma vez).
- Triângulo vale 1 ponto, mais 1 por estrela gigante (dourada) nos cantos. Gigantes nunca são vizinhas.
- Traços prateados já vêm desenhados (a "figura" antiga da constelação); nunca dois no mesmo triângulo,
  para ninguém começar com triângulo de graça.
- Acabaram os traços: ganha quem tem mais pontos. Empate em pontos: ganha quem fechou o último triângulo
  (não existe empate).
- Quem começa alterna de céu para céu (céus ímpares você, pares o adversário).
- Céu seguinte libera quando você vence o anterior contra qualquer adversário. Cada céu tem 3 estrelas
  na escolha: uma por adversário vencido (moldura dourada = venceu o Mestre).

### Constelações (`js/levels.js`)

1 A Pipa (8 estrelas, na frente) · 2 O Peixe · 3 A Viola (1 gigante) · 4 O Tatu (traços prontos) ·
5 A Rede · 6 O Barco (passa por cima da cabeça) · 7 A Coroa · 8 O Caracol (fica atrás de você) ·
9 A Fogueira (360° em volta) · 10 O Céu Inteiro (44 estrelas, 118 traços, 75 triângulos, 5 gigantes).

### Adversários (`js/ai.js`)

- **Lua** (a aprendiz): pega triângulo quase sempre, às vezes entrega à toa, entrega cadeias meio ao acaso.
- **Cometa** (o guloso): pega tudo, nunca entrega se tiver jogada segura, entrega a menor cadeia, não
  planeja o fim.
- **Mestre Órion** (o mestre): só jogada segura enquanto existe e escolhe a que deixa o outro sem jogada
  segura primeiro (conta quem vai ter de abrir as cadeias); na fase de entregar cadeias simula o resto da
  partida para cada traço (aprende a recusar o fim de uma cadeia para ficar no controle); com 16 traços
  ou menos calcula o fim exato.

## Como testar

- `npm test` (ou `node tests/run.js`): malhas das 10 constelações válidas (cada traço em 1 ou 2
  triângulos, tudo ligado, estrelas não grudadas, nada embaixo do chão, Euler, gigantes e traços prontos
  certos, céu crescendo, geração sempre igual, Caracol atrás, Fogueira e Céu Inteiro em 360°), regras
  (fechar e jogar de novo, gigante vale 2, traço que fecha dois, desempate pelo último triângulo, traços
  prontos, quem começa), contagem em partidas aleatórias, IA (fim exato confere com busca completa,
  pega triângulo, mestre só faz jogada segura, traço sempre válido, tempo de pensar < 250 ms), Mestre
  contra Lua e Cometa (20 partidas cada; tem de ganhar a maioria; mostra placares), robô completa as 10
  constelações e o teste de fumaça do `main.js` (`tests/smoke/run.js`: menu com o mouse, clique e
  arrasto, vista girando, seta do adversário, pausa, controle e mão do Quest simulados, manche, robô
  vencendo os 10 céus pelo jogo de verdade, save). Não toca som. Termina com "Tudo certo" ou sai com
  código 1. Leva uns 10 s.
- Console do navegador: `dev.autoplay = true` (robô joga por você), `dev.advance(10)` (avança 10 s),
  `dev.state()`, `dev.loadLevel(5, 3)` (céu 5 contra o adversário 3), `dev.play(n)` (desenha o traço n),
  `dev.menu()`, `dev.resetSave()`. `window.constelacao` tem `game`, `cur`, `save`, `camera`, `scene`,
  `renderer`, `view`.
- **Só dá para testar no óculos:** mira com o raio a 6 m, pinça das mãos, conforto da seta e do placar
  preso na vista, manche, vibração, desempenho.

## Estrutura

- `index.html`, `css/style.css`: página, placar e dicas do PC.
- `js/board.js`: gerador das malhas (pontos na calota da esfera, Delaunay pela projeção estereográfica,
  limpeza da borda, gigantes, traços prontos) e `validateBoard`.
- `js/levels.js`: as 10 constelações (centro, tamanho, sementes escolhidas para dar céus bons).
- `js/game.js`: regras (`Game`).
- `js/ai.js`: adversários, fim exato, simulação.
- `js/sky.js`: céu de fundo, mirante, texturas de brilho.
- `js/ui.js`: painel de menu desenhado em canvas (mesmo no PC e no VR).
- `js/main.js`: cena, mira, VR, mouse, menus, seta, placar, `window.dev`.
- `js/audio.js`: sons sintetizados. `js/save.js`: progresso (`localStorage`, chave `constelacaovr.v1`).
- `tests/run.js`, `tests/smoke/` (navegador de mentira; `three-stub.js` troca o renderizador).

## Regras e convenções do projeto

- Esfera de estrelas com raio de 6 m centrada a 1,5 m de altura; no VR o centro fica perto da cabeça.
- Testes nunca tocam som e saem com código 1 se falharem.
- Mudou malha ou semente: rodar `npm test` (a geração tem de continuar válida e o robô vencendo).

## Decisões

- Desempate pelo último triângulo fechado: evita empate e valoriza o fim da partida.
- Traços prontos no máximo um por triângulo: senão quem joga primeiro ganharia triângulo de graça.
- Quem começa alterna por céu, para equilibrar.
- Fim exato só com 16 traços ou menos (com 20 chegava a 320 ms no PC e travaria o quadro no Quest);
  antes disso o mestre usa a simulação (< 60 ms).
- A ajuda de cor no traço vem ligada (o jogo é pouco conhecido); dá para desligar no menu.

## Pendências / problemas conhecidos

- Não testado no Quest 3 de verdade.
- A IA pensa no mesmo quadro do jogo (até ~60 ms no PC; no Quest pode dar um soluço quando o mestre pensa).
