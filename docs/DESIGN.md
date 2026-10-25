# DESIGN.md — Raio-X do Tráfego

> Leia antes de criar ou alterar qualquer tela. O [`SISTEMA.md`](SISTEMA.md) define o significado dos dados; este arquivo define a apresentação.
> Uma decisão visual nunca inventa IPs, rótulos, números ou desempenho que não existam nos dados.

## 1. Identidade

A identidade vem de [`raio-x/raio-x-card-light.svg`](../raio-x/raio-x-card-light.svg): papel claro, tinta escura e as duas hastes do “X”,
em verde-azulado e violeta. As duas cores são as **duas direções do tráfego**: cliente → servidor e servidor → cliente.

Duas superfícies:

- **Papel** — todo o site. Fundo branco, grade técnica muito leve, linhas finas de 1 px, numeração de seção em mono (`01 ·`).
- **Filme** — só nos visores de instrumento (scanner, matrizes, processamento). Fundo `#0A0F14`, como uma chapa de raio-X no negatoscópio.
  Marcas de registro nos cantos (`.registro`).

O que **não** usar, porque é o que deixa a interface com cara de gerada: gradientes roxos, vidro fosco, brilho neon, sombras pesadas,
ícones de faísca, cartões arredondados com sombra em tudo, emojis. Hierarquia vem de tipografia, espaço e linhas.

## 2. Tokens (`web/app/globals.css`)

| Papel | Token | Valor |
| --- | --- | --- |
| Papel | `--paper` / `--paper-2` / `--paper-3` | `#FFFFFF` / `#F4F6F6` / `#E9EDEE` |
| Tinta | `--ink` / `--ink-2` | `#0A0F14` / `#26313B` |
| Ardósia (texto secundário) | `--slate` / `--slate-2` | `#5B6B7B` / `#8A97A4` |
| Linhas | `--line` / `--line-strong` | `#E1E6E9` / `#C5CED5` |
| Marca, cliente → servidor | `--teal` (`--up`) | `#0D9488` |
| Servidor → cliente | `--violet` (`--down`) | `#7C5CFF` |
| Filme | `--film`, `--film-text`, `--film-muted`, `--film-teal`, `--film-violet` | `#0A0F14`, `#E6EDF3`, `#7D8B99`, `#2DD4BF`, `#9D85FF` |

Os nomes antigos (`--bg`, `--surface`, `--text`, `--accent`…) continuam apontando para esses valores.

### 2.1 Cores com significado — validadas

Validadas com `dataviz/scripts/validate_palette.js` sobre `#FFFFFF`. Não trocar a ordem nem o valor sem rodar o validador de novo.

| Grupo | Ordem | Resultado |
| --- | --- | --- |
| Modelos | B1 `#EB6834` · B2 `#6250D6` · P `#0D9488` | passa em **todos os pares** (podem aparecer juntos em qualquer gráfico) |
| Categorias | chat `#2A78D6` · e-mail `#EDA100` · transferência `#E34948` · streaming `#008300` · VoIP `#E87BA4` | passa nos pares adjacentes; avisos de CVD e contraste ⇒ **todo gráfico de categoria leva rótulo visível ou tabela** |
| Estado | ok `#15803D` · aviso `#B45309` · erro `#DC2626` | só para estado, sempre com texto |

Regras: direção só onde há pacotes; categoria só onde há classes; nunca as duas no mesmo gráfico. Texto nunca usa a cor da série.
Magnitude (F1, confusão, oclusão) usa uma só matiz, do `--paper-2` ao `--teal-ink`.

### 2.2 Tipografia

- **Archivo** variável com eixo de largura (`wdth.css`). Títulos usam `.display`: largura 110%, peso 640, entrelinha 0,98.
- **IBM Plex Mono** para números, bytes, ms, rótulos pequenos (`.eyebrow`, caixa alta, 0,08em).
- Números sempre `tabular-nums` e no formato brasileiro (`1.402`, `0,541`).

### 2.3 Forma

Raio de 6 px (cartões, botões); chips 999 px. Botão primário é tinta sólida; secundário é contorno. Espaço em múltiplos de 4 px.
Tabelas: régua de tinta no topo, linhas finas, cabeçalho em mono.

## 3. Movimento

- Animar só `transform`, `opacity` e o traço de caminhos SVG. Canvas para muitos elementos (o scanner).
- Durações: hover 150 ms; entrada de seção 500 ms subindo 12 px (`Reveal`); troca de fase 420 ms.
- `prefers-reduced-motion`: o scanner mostra um quadro parado com as matrizes já preenchidas; nada importante existe só em movimento.
- **O conteúdo nunca é decifrado na animação.** No scanner, o payload aparece como caracteres hexadecimais embaralhados *antes* do feixe;
  depois dele, o pacote vira só a medida (tamanho, direção, Δt). Essa é a ideia central do trabalho.

## 4. Gráficos (`components/raiox/graficos.tsx`)

Primitivas próprias em SVG: `Linhas` (eixo x categórico, banda de IC95%), `PontosIntervalo`, `Calor` e `TabelaDados`.
Todas têm legenda, rótulo direto nas séries, dica ao passar o mouse e tabela alternativa. Um só eixo y; grade discreta; marcas de 2 px; pontos de 9 px com anel de papel.

## 5. Mapa de fluxos (aba do painel)

Fitas anônimas dos fluxos principais numa linha do tempo, entre o início e o fim da duração observada na extração — que pode abranger mais do que os até 100 trios guardados e nunca é recalculada a partir deles. Carrega páginas de até 100 fluxos, sequencialmente, até o máximo de 500; desenha só os fluxos com duração conhecida e informa separadamente as durações desconhecidas entre os carregados e os fluxos não carregados por causa do limite (a contagem de duração desconhecida cobre apenas os fluxos carregados). Cor = palpite do modelo e da semente selecionados; contorno tracejado = discordância entre B1/B2/P. Sem IPs, portas, hosts ou topologia. Na oclusão do raio-X, o pacote é zerado em todos os canais, inclusive a máscara.

## 6. Fluxo das telas

```
Início (/) ──► Análise ao vivo (/analise) ──► Resultados (/resultados) ──► Metodologia (/metodologia)
     │
     └──► Enviar (/enviar) ──► Processando (/a/{id}) ──► Painel (/a/{id}) ──► Raio-X do fluxo (/a/{id}/fluxo/{n})
                         └──► Exemplo ISCX ──► Caso (/a/{id}) ──► Raio-X do fluxo
```

| Tela | Pergunta | Conteúdo |
| --- | --- | --- |
| Início | O que é isso? | Manchete, scanner com fluxos reais, números da execução, as quatro medidas, os três modelos, o caminho da análise |
| Análise | Está funcionando? | Cinco fases (capturas, sessões, matrizes, treino, teste) com contadores, registro e visor; termina no macro-F1 de C1 |
| Resultados | O que o experimento mostrou? | Veredito H1–H4, C1/C2, C3, C4, C5, X1, F1 por classe, confusão, oclusão, exposição, todos os testes |
| Metodologia | Como foi feito? | Protocolo do pcap ao teste estatístico, com os números desta execução |
| Enviar | Como analiso os meus? | Área de arraste, limites, privacidade, exemplos do ISCX |
| Processando / Painel / Raio-X | O que tem no meu arquivo? | Estado real da API; painel com concordância, mapa e tabela; raio-X por fluxo |

A **Análise** reproduz, com o ritmo de uma execução ao vivo, os números reais apurados por `python -m experimento.executar`
(`web/data/experimento.json`): capturas lidas, pacotes, fluxos, partições, as 250 execuções e os palpites da amostra de teste.
Nenhum número é sintético. Na tela de processamento de um envio, o visor ilustra a etapa com fluxos do ISCX e os contadores são os da API — a legenda diz isso.

Em telas com palpites: probabilidades não são confiança calibrada; concordância e estabilidade não são acurácia; uploads não têm rótulo para medir acerto.

## 7. Pronto quando

- [ ] Só tokens da seção 2; paletas novas passam pelo validador
- [ ] 1440 px e 390 px sem rolagem horizontal da página
- [ ] Movimento reduzido tratado; foco visível no teclado
- [ ] Estados de carregando, vazio e erro
- [ ] Gráficos com legenda, rótulo direto, dica e tabela
