# DESIGN.md — Raio-X do Tráfego

> **Leia este arquivo inteiro antes de criar ou alterar qualquer tela, componente ou animação.**
> Ele define quem faz o quê (seção 1), o visual (seções 2 a 5), as animações (seção 6) e o que cada tela mostra (seção 7).
> Este arquivo define a apresentação. O [`README.md`](../README.md) apresenta a aplicação, e [`SISTEMA.md`](SISTEMA.md) define os dados disponíveis, o protocolo experimental e o significado dos resultados. As telas devem respeitar esses contratos; uma orientação visual nunca deve inventar IPs, rótulos ou desempenho que não existem nos dados.

---

## 1. Divisão de trabalho entre os agentes

O projeto usa **dois modelos com papéis fixos**. Nenhum dos dois faz o trabalho do outro.

| | **GPT Astra** | **GPT-6 Sol** (esforço de raciocínio **médio**) |
| --- | --- | --- |
| Papel | Telas difíceis e **todas as animações** | Todo o resto: estrutura, telas simples, integração |
| Bibliotecas de animação | **GSAP** (`gsap` + `@gsap/react`) e **Motion** (`motion/react`) | Só **consome** os componentes animados prontos; não escreve GSAP |
| Pasta onde escreve | `web/components/motion/` e as telas da lista abaixo | `web/app/`, `web/components/ui/`, `web/lib/`, `api/`, `worker/`, `core/` |

### 1.1 O que é do GPT Astra

1. **Tela 1 — Início:** o fundo animado do topo (pacotes trafegando entre cliente e servidor) e a área de upload com animação de arrastar e soltar.
2. **Tela 2 — Processando:** o pipeline animado (pcap → fluxos → matriz → modelos) e os contadores ao vivo.
3. **Tela 4 — Raio-X do fluxo:** a tela inteira. É a mais difícil e a vitrine do projeto.
4. **Mapa de fluxos** (aba do painel): fitas anônimas organizadas por início e duração observada do fluxo, sem topologia de hosts ou servidores.
5. **Componentes animados compartilhados**, usados pelo Sol nas outras telas:

| Componente | O que faz | Biblioteca |
| --- | --- | --- |
| `PacketStream` | Pacotes viajando entre duas faixas (cliente ↔ servidor) | GSAP (canvas) |
| `PacketLadder` | Escada de pacotes do raio-X, sincronizada com a matriz | GSAP timeline |
| `MatrixGrid` | Matriz 32×4 preenchendo célula a célula | GSAP stagger |
| `FlowRibbons` | Fitas temporais anônimas dos fluxos numerados que se desenham | GSAP (SVG path) |
| `TimelineScrubber` | Linha do tempo com marcadores e cursor arrastável | GSAP + Draggable |
| `ProbBars` | Barras de probabilidade das 5 classes com mola | Motion |
| `CountUp` | Número que sobe até o valor | Motion |
| `Sparkline` | Minigráfico de linha que se desenha ao entrar | GSAP (SVG path) |
| `ModelToggle` | Seletor B1 / B2 / P com o destaque deslizando | Motion (`layoutId`) |
| `FadeIn` | Entrada simples de seção ao rolar (opacidade + 12 px) | Motion (`whileInView`) |

### 1.2 O que é do GPT-6 Sol (esforço médio)

1. **Casca do app:** barra superior, barra lateral da análise, rotas, layout responsivo e tema.
2. **Tela 3 — Painel:** montagem dos cards, gráficos e tabela, usando `CountUp`, `Sparkline`, `ModelToggle` e o `FlowRibbons` do Astra.
3. **Tela 5 — Metodologia e resultados:** texto, imagens e gráficos interativos das 250 execuções corrigidas. Animação só de entrada simples (fade/slide de 12 px) com o `FadeIn` do Astra.
4. **Componentes de interface sem animação complexa:** botões, cards, tabelas, chips, campos, estados vazios, mensagens de erro e carregamento.
5. **Cliente da API, tipos TypeScript, backend (FastAPI, worker, banco) e testes.**

### 1.3 Regras de passagem entre os dois

- O **Astra entrega** cada componente animado com: props tipadas, dados de exemplo e uma página de demonstração em `/dev/componentes`.
- O **Sol só usa a API pública** do componente (props). Se precisar de algo novo (outra cor, outro tamanho, um evento), **pede ao Astra** em vez de editar o componente.
- O **Astra não mexe** em rotas, API nem banco. Se uma tela dele precisar de dados novos, descreve o formato e o Sol implementa o endpoint.
- Os dois seguem os mesmos tokens (seção 3). Cor, fonte ou espaçamento fora da lista é erro.

### 1.4 Ordem de trabalho

1. **Sol:** casca do app, tokens em `tailwind.config.ts`, componentes `ui/` básicos.
2. **Astra:** `PacketLadder` + `MatrixGrid` + `ProbBars` → tela 4 completa com dados de exemplo.
3. **Sol:** painel (tela 3) com componentes estáticos provisórios.
4. **Astra:** `CountUp`, `Sparkline`, `ModelToggle`, `FlowRibbons` → o Sol troca os provisórios.
5. **Astra:** telas 1 e 2.
6. **Sol:** metodologia, integração com a API real, responsivo, revisão final.

---

## 2. Referências e o que tirar de cada uma

Arquivos disponíveis em `referencias/`: `dashboard1.webp` e `dashboard2.webp`. **Use como inspiração de padrões, nunca como cópia:** não reproduza logotipos, nomes, textos, ícones próprios nem o layout idêntico de nenhuma delas. A antiga referência 03 não está no repositório; o mapa abstrato abaixo é uma especificação própria do projeto.

### 01 — SentinelX (`dashboard1.webp`)
- **Pegar:** barra superior com navegação em abas (aba ativa preenchida em azul) e busca à direita; **4 cards de indicador** no topo, com título pequeno, ícone colorido no canto, número grande e uma linha de tendência embaixo; gráfico de área com **cartão de tooltip** flutuante; o bloco **“AI Analyst”**, que no nosso projeto vira **“Leitura do resultado”**; tabela com **barra de progresso** e **chips de status** coloridos.
- **Adaptar:** o medidor semicircular (“Overall Integrity Score”) vira o **medidor de concordância entre os 3 modelos**.
- **Não usar:** mapa-múndi (não há geolocalização nem IPs persistidos).

### 02 — pyMC Repeater (`dashboard2.webp`)
- **Pegar:** **barra lateral** com seções (AÇÕES, MONITORAMENTO, SISTEMA); **cards com sparkline**, cada um numa cor; gráfico de **curvas suaves com marcadores**; gráfico de barras de distribuição; **tabela de pacotes** com chips de rota (`Direct`, `Advert`) e status colorido (`Dropped` em vermelho); fundo escuro esverdeado com cards translúcidos.
- **Adaptar:** a barra lateral vira o painel da análise (nome do arquivo, estado, ação “Nova análise” e, na fase 2, “Exportar CSV”, totais); a tabela “Recent Packet” vira a **tabela de pacotes do raio-X** (tempo, direção, bytes, Δt).

### 03 — Mapa de fluxos abstrato (conceito do projeto; sem imagem de referência)

- **Construir:** fitas anônimas dos fluxos principais numa linha do tempo, com marcador de início, protocolo e duração observada na extração, do primeiro ao último pacote com carga útil. Essa duração pode abranger mais do que os até 100 trios guardados e não deve ser recalculada a partir dessa amostra. A cor indica a **categoria prevista pelo modelo e semente selecionados**; discordância entre B1/B2/P na mesma semente recebe contorno âmbar tracejado. A largura representa apenas os bytes da amostra guardada.
- **Limitar:** carregar páginas de até 100 fluxos, sequencialmente, até o máximo de 500; desenhar apenas fluxos com duração conhecida e informar separadamente durações desconhecidas entre os carregados e fluxos não carregados por causa do limite. A contagem de duração desconhecida cobre apenas os fluxos carregados. Não inferir duração ausente. Sem IPs, portas, hosts, servidores, geolocalização ou nomes de aplicações inferidos. O mapa mostra padrões temporais, não topologia real nem detecção de ataques.

---

## 3. Tokens (fonte única de verdade)

**Tema:** escuro apenas, no MVP. Definir tudo em `tailwind.config.ts` e em variáveis CSS em `globals.css`. Nunca usar cor literal em componente.

### 3.1 Superfícies e texto

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#0A0F14` | Fundo da página |
| `--bg-grid` | `rgba(56, 189, 248, 0.05)` | Grade e pontos discretos do fundo |
| `--surface` | `#111820` | Cards |
| `--surface-2` | `#161F29` | Card em destaque, hover, tooltip |
| `--border` | `#223040` | Bordas de card e divisórias |
| `--border-strong` | `#2F4255` | Bordas de campos e tabelas |
| `--text` | `#E6EDF3` | Texto principal |
| `--text-muted` | `#8B9BAB` | Rótulos, legendas |
| `--text-faint` | `#5B6B7B` | Posições vazias, eixos |
| `--accent` | `#22D3EE` | Ação principal, aba ativa, foco |
| `--accent-2` | `#7C5CFF` | Botão secundário de destaque (como “Deep Scan” na ref. 01) |

### 3.2 Cores com significado (não trocar o significado)

| Grupo | Token | Valor | Onde aparece |
| --- | --- | --- | --- |
| Direção | `--up` (cliente → servidor) | `#2DD4BF` | Só no raio-X e no `PacketStream` |
| | `--down` (servidor → cliente) | `#A78BFA` | Só no raio-X e no `PacketStream` |
| Modelos | `--b1` (Random Forest) | `#FB923C` | Em todo o site, sempre que um modelo aparece |
| | `--b2` (CNN) | `#94A3B8` | Idem |
| | `--p` (CNN + pré-treino) | `#38BDF8` | Idem |
| Categorias | `--cat-chat` | `#60A5FA` | Painel, mapa de fluxos, tabelas |
| | `--cat-email` | `#FBBF24` | Idem |
| | `--cat-transf` | `#34D399` | Idem |
| | `--cat-stream` | `#F472B6` | Idem |
| | `--cat-voip` | `#C084FC` | Idem |
| Estado | `--ok` | `#22C55E` | Concordam, pronta; comparação com rótulo de referência só nos exemplos |
| | `--warn` | `#F59E0B` | Discordam, aviso de limite ou captura parcial |
| | `--bad` | `#EF4444` | Erro, pacote perdido |

Regra: cores de **direção** só aparecem onde há pacotes; cores de **categoria** só onde há classes. Nunca as duas no mesmo gráfico.

### 3.3 Tipografia

| Papel | Fonte | Tamanhos |
| --- | --- | --- |
| Interface e títulos | **Archivo** (Google Fonts), fallback `system-ui, sans-serif` | 12 / 14 / 16 / 20 / 28 / 40 px |
| Números, bytes, ms, identificadores de fluxo, nomes de arquivo | **IBM Plex Mono**, fallback `ui-monospace, monospace` | 11 / 12 / 14 px; números grandes dos cards em 28–32 px |

- Números sempre com `font-variant-numeric: tabular-nums`.
- Rótulos pequenos em caixa alta com `letter-spacing: 0.06em` (como “MEMORY”, “PROCESSOR” na ref. 01).
- Formato brasileiro: `1.402`, `4,2 MB`, `94%`.

### 3.4 Forma e espaçamento

- Espaçamento em múltiplos de 4 px; entre cards, 16 px; padding de card, 20 px.
- Raio: cards 12 px, botões e campos 8 px, chips 999 px.
- Borda de 1 px `--border`. Sem sombras pesadas; o brilho só aparece em elementos ativos: `box-shadow: 0 0 24px rgba(34, 211, 238, 0.15)`.
- Cards podem ter fundo levemente translúcido (`rgba(17, 24, 32, 0.85)`) sobre a grade do fundo, como na ref. 02.

---

## 4. Estrutura do app

```
┌──────────────────────────────────────────────────────────────┐
│ Barra superior: logo · Início · Metodologia · [Nova análise] │  ← ref. 01
├────────────┬─────────────────────────────────────────────────┤
│ Lateral da │  Conteúdo da aba ativa:                          │
│ análise    │  Visão geral | Mapa de fluxos | Fluxos           │  ← abas
│ (ref. 02)  │                                                   │
│ arquivo    │                                                   │
│ estado     │                                                   │
│ totais     │                                                   │
│ ações      │                                                   │
└────────────┴─────────────────────────────────────────────────┘
```

- A lateral só aparece dentro de uma análise (`/a/{id}`). Em telas < 1024 px, ela vira um bloco recolhível no topo.
- Largura máxima do conteúdo: 1440 px. Gutter lateral mínimo de 16 px.
- Celular (390 px): tudo em uma coluna; tabelas com rolagem horizontal própria.

---

## 5. Componentes de interface (Sol)

| Componente | Especificação |
| --- | --- |
| `StatCard` | Título 12 px muted + ícone colorido no canto · valor 28 px mono (com `CountUp`) · linha de contexto 12 px (verde, âmbar ou vermelha) · `Sparkline` opcional à direita |
| `Card` | Superfície, borda, raio 12, título 14 px semibold com ícone, ação opcional no canto (botão pequeno, como “Diagnostics”) |
| `Chip` | Altura 22 px, fundo da cor a 15%, texto na cor cheia: categoria, modelo ou estado |
| `ProbabilityBar` | Barra de 4 px com a cor do modelo e sua probabilidade não calibrada em mono; não usar a palavra “certeza” |
| `DataTable` | Cabeçalho 11 px caixa alta muted · linhas de 44 px · divisória `--border` · hover `--surface-2` · coluna final com link “Raio-X →” |
| `InsightBox` | Bloco “Leitura do resultado”, fundo `--accent-2` a 10%, ícone, texto de 2 a 3 linhas **gerado a partir dos dados por regras fixas** (não por IA). Ex.: “Na semente selecionada, os 3 modelos concordam em 71% dos fluxos principais; nos demais, há divergência de palpite.” Esse percentual é ilustrativo, não um resultado do estudo. |
| `EmptyState` / `ErrorState` | Ícone, uma frase do que aconteceu e o botão do que fazer |

---

## 6. Animações

### 6.1 Quando usar GSAP e quando usar Motion

| Use **GSAP** para | Use **Motion** para |
| --- | --- |
| Sequências com muitos passos (timeline) | Entrada e saída de componentes (`AnimatePresence`) |
| Animação controlada por tempo ou arrastada (scrub, play/pause) | Mudança de layout e de aba (`layout`, `layoutId`) |
| Desenhar caminhos SVG (fitas, sparklines, setas) | Hover, toque e foco |
| Canvas com muitos elementos (`PacketStream`) | Números e barras com mola (`useSpring`) |
| Animação ligada à rolagem (`ScrollTrigger`) | Pequenas transições de estado |

**Nunca anime o mesmo elemento com as duas bibliotecas.**

### 6.2 Regras técnicas

- GSAP no React sempre com `useGSAP()` de `@gsap/react`, com escopo no `ref` do componente, para a limpeza ser automática.
- Motion importado de `motion/react`.
- Animar só `transform` e `opacity`. Nada de animar `width`, `height`, `top` ou `left` (exceção: o `d` de caminhos SVG no GSAP).
- Mais de 200 elementos animados ao mesmo tempo → canvas, não DOM.
- Meta: 60 fps num notebook comum. Testar com a aba Performance do Chrome.
- **`prefers-reduced-motion`:** toda animação tem versão sem movimento (estado final direto). Em GSAP, use `gsap.matchMedia()`; em Motion, `useReducedMotion()`.
- A página precisa fazer sentido parada: nada importante pode existir só durante a animação.

### 6.3 Durações e curvas

| Tipo | Duração | Curva |
| --- | --- | --- |
| Hover, foco, clique | 150 ms | `power2.out` / `easeOut` |
| Troca de aba ou de modelo | 250 ms | mola: `stiffness 400, damping 32` |
| Entrada de card ou seção | 400 ms, cards em sequência com 60 ms de atraso | `power3.out` |
| Desenho de linha ou fita | 700–900 ms | `power2.inOut` |
| Pacote no raio-X | 1 pacote a cada 320 ms (velocidade normal); 650 ms (lenta); 120 ms (rápida) | `power1.inOut` |
| `CountUp` | 800 ms | `easeOut` |

### 6.4 As animações principais (Astra)

**A. Fundo do Início (`PacketStream`).** Duas faixas verticais finas (Cliente à esquerda, Servidor à direita) e pacotes como retângulos pequenos atravessando de uma para a outra. A largura de cada pacote é proporcional ao tamanho em bytes, e a cor indica a direção (`--up` ou `--down`). Usar dados de 3 fluxos processados do ISCX (VoIP, streaming, chat) em loop, para o ritmo ser visível. Um miolo abstrato `▒▒▒` indica que o site não exibe payload; não afirma que cada pacote estava cifrado. Canvas + GSAP ticker.

**B. Processando.** Quatro etapas ligadas por uma linha que se preenche (recebida → extraindo → classificando → pronta). Durante “extraindo”, pacotes pequenos caem numa grade 32×4 em miniatura. `CountUp` nos contadores de pacotes e de fluxos, que se atualizam a cada consulta à API.

**C. Raio-X do fluxo.** Uma **timeline GSAP única** controla tudo, e o slider “pacotes vistos” é o `progress` dessa timeline. A cada pacote:
1. a seta do pacote se desenha da origem ao destino (escada cliente ↔ servidor);
2. a linha correspondente da `MatrixGrid` acende, e os 4 valores aparecem com stagger de 40 ms;
3. as `ProbBars` dos 3 modelos da semente selecionada se ajustam com mola;
4. a célula do pacote na faixa “palpite depois de cada pacote” destaca a categoria prevista. Só nos exemplos ela pode indicar correspondência com o rótulo de referência herdado da captura; em uploads, nunca dizer “acertaria” ou “erraria”.

Botões **Reproduzir / Pausar / Reiniciar** e o controle de velocidade agem sobre essa timeline. A sequência é uma reprodução de pacotes já lidos; as curvas por prefixo são explorações calculadas para uma semente por requisição, usando prefixos de 1 até `min(32, pacotes guardados)` e os classificadores locais reconstituídos. O estudo não avaliou quantos pacotes seriam necessários para decidir, e essas curvas não reproduzem necessariamente as previsões salvas no estudo. As probabilidades não são calibradas. A oclusão disponível para B2/P zera os quatro canais da linha, inclusive a máscara, e mede sensibilidade, não causalidade.

**D. Mapa de fluxos (`FlowRibbons` + `TimelineScrubber`).** Cada fita é um fluxo principal numerado, situado entre o início e o fim observados na extração; a duração conhecida pode exceder o intervalo coberto pelos até 100 trios armazenados. Duração desconhecida permanece desconhecida e o fluxo não é desenhado. O mapa carrega até 500 fluxos em páginas sequenciais de até 100 e informa tanto os fluxos carregados omitidos por duração desconhecida quanto os que ficaram fora do carregamento pelo limite; a contagem de duração desconhecida considera apenas os carregados. Não há desenho de conexão entre hosts ou servidores, pois IPs e portas não são armazenados. Ao entrar, as fitas se desenham em sequência. Hover destaca a fita e mostra protocolo, até 100 pacotes guardados, bytes dessa amostra e os três palpites da semente selecionada. O scrubber filtra pelo início observado do fluxo.

**Simulação local na tela 4 (T-024, Astra).** Controle explícito de ativação, níveis 0/10/20% e semente visual independente dos modelos. A seleção determinística cobre todos os pacotes guardados; a escada continua limitada aos primeiros 32 índices originais, sem compactar retidos nem montar nova entrada. Pacotes perdidos têm seta interrompida com ×, borda tracejada `--bad` e texto “Perdido”; retidos têm texto “Retido”. A tabela mostra o estado de todos os pacotes e os totais distinguem amostra e escada. O estado textual fica visível com a reprodução parada. Em movimento reduzido, a timeline permanece no estado final estático e os controles da simulação continuam disponíveis. Durante a simulação, a matriz fica estática, as barras mostram o prefixo original completo e prefixos/oclusão são identificados como entrada original. Aviso obrigatório: somente perda visual, sem recalcular intervalos/características ou reclassificar; nenhuma métrica simulada, persistência ou chamada à API. Resultados do C4 permanecem separados e imutáveis. Demonstração disponível em `/dev/componentes`.

---

## 7. O que cada tela mostra

| Tela | Rota | Dono | Conteúdo |
| --- | --- | --- | --- |
| 1. Início | `/` | Astra (topo animado) + Sol (resto) | Frase do que o site faz · `PacketStream` · área de upload (até 200 MB) · aviso de privacidade · 5 exemplos do ISCX · como gerar um pcap |
| 2. Processando | `/a/{id}` (estado ≠ pronta) | Astra | 4 etapas animadas · contadores ao vivo · frase explicando cada etapa |
| 3. Painel — Visão geral | `/a/{id}` | Sol (com componentes do Astra) | Seletor de semente 0–4 para os três modelos juntos · 4 `StatCard` (fluxos principais, pacotes lidos, duração observada, concordância na semente ativa; extras no contexto) · categorias com `ModelToggle` · área empilhada por categoria prevista · estabilidade entre sementes · `InsightBox` |
| 3. Painel — Mapa de fluxos | `/a/{id}?aba=mapa` | Astra | Fitas temporais anônimas (`FlowRibbons`) + `TimelineScrubber`, sem topologia ou endpoints |
| 3. Painel — Fluxos | `/a/{id}?aba=fluxos` | Sol | `DataTable` com filtros: categoria prevista, modelo, semente e “só onde discordam” |
| 4. Raio-X do fluxo | `/a/{id}/fluxo/{n}` | Astra | Escada + matriz 32×4 + três modelos da semente ativa, com troca de semente + faixa exploratória de palpites + oclusão apenas de B2/P + tabela de pacotes (estilo ref. 02) |
| 5. Metodologia e resultados | `/metodologia` | Sol | Problema, matriz, três métodos, gráficos interativos das 250 execuções corrigidas, médias e variação entre cinco sementes, H1–H4, limitações e créditos |

Em todas as telas com palpites: mostrar as **probabilidades produzidas pelo modelo**, indicando que não são confiança calibrada; não aplicar um corte automático de 50% nem criar a classe “incerto” sem validação. Mostrar qual semente está ativa e distinguir **concordância entre modelos** de **estabilidade entre sementes**. Aviso fixo e discreto: *“Modelos treinados com tráfego do ISCX de 2016. Em capturas atuais, os palpites podem errar mais.”* Nos exemplos, identificar o rótulo de referência como herdado da captura; nos uploads, não há rótulo para medir acerto.

---

## 8. Pedidos-modelo

**Para o GPT Astra:**
```
Leia docs/DESIGN.md (seções 1, 3 e 6) e veja docs/referencias/.
Crie o componente <NOME> em web/components/motion/<Nome>.tsx.
Animação: <descrição da seção 6.4>. Use <GSAP | Motion> conforme a seção 6.1.
Entregue: props tipadas, dados de exemplo e a demonstração em /dev/componentes.
Respeite prefers-reduced-motion e anime só transform/opacity.
Não altere rotas, API nem componentes de web/components/ui/.
```

**Para o GPT-6 Sol (esforço médio):**
```
Leia docs/DESIGN.md (seções 1, 3, 4, 5 e 7).
Monte a tela <NOME> em web/app/<rota>/page.tsx.
Use os componentes prontos de web/components/motion/ sem modificá-los.
Se faltar algo num componente animado, descreva o que falta em vez de editar.
Siga os tokens da seção 3; nenhuma cor ou fonte fora da lista.
Teste em 1440 px e 390 px.
```

---

## 9. Pronto quando

- [ ] Usa só tokens da seção 3
- [ ] Funciona em 1440 px e 390 px, sem rolagem horizontal da página
- [ ] Animações a 60 fps e com versão para `prefers-reduced-motion`
- [ ] Foco visível no teclado e contraste legível
- [ ] Estados de carregando, vazio e erro feitos
- [ ] Nada copiado literalmente das referências
- [ ] Componente animado com demonstração em `/dev/componentes`
