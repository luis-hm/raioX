# Spec: Interface do Raio-X do Tráfego

> feature: raiox-interface
> status: em-implementacao

## Contexto

Construir a interface didática do Raio-X para que estudantes e avaliadores acompanhem como tamanho, direção e tempo dos pacotes viram uma matriz e palpites de modelos, sem confundir palpite com certeza ou resultado científico.

## Histórias

### US-010 — Explorar o experimento visualmente

Como estudante ou avaliador, quero percorrer a análise desde a entrada até o detalhe de um fluxo, para compreender o papel dos metadados, comparar modelos e observar suas limitações.

#### AC-015 — Casca e tokens mantêm identidade consistente

- **Dado** qualquer rota do produto
- **Quando** a tela é aberta em desktop ou celular
- **Então** a navegação, tema escuro, tipografia, cores semânticas e componentes básicos seguem `docs/DESIGN.md`, sem rolagem horizontal da página a 390 px

#### AC-016 — Início permite enviar captura ou escolher exemplo

- **Dado** a tela inicial
- **Quando** escolho um `.pcap`/`.pcapng` de até 200 MB ou um dos cinco exemplos
- **Então** a interface explica privacidade, exibe o aviso científico, identifica o rótulo de exemplo como herdado e inicia uma análise sem apresentar palpites como certeza

#### AC-017 — Processamento comunica estado e progresso

- **Dado** uma análise recebida, extraindo, classificando, pronta ou com erro
- **Quando** abro `/a/{id}` antes de estar pronta ou durante uma falha
- **Então** vejo o estágio, contadores disponíveis, explicação simples e uma ação útil; animação não é a única forma de comunicar o estado

#### AC-018 — Painel compara palpites sem inventar acurácia

- **Dado** uma análise pronta
- **Quando** escolho semente, modelo ou aba do painel
- **Então** a visão geral mostra os quatro indicadores definidos, categorias e estabilidade entre sementes; a tabela filtra fluxos; o mapa mostra apenas fitas temporais anônimas; concordância nunca é chamada de acurácia

#### AC-019 — Raio-X liga pacote, matriz e previsão

- **Dado** um fluxo principal
- **Quando** avanço, pauso, reinicio ou ajusto velocidade na tela `/a/{id}/fluxo/{n}`
- **Então** a reprodução sincroniza pacote, linha da matriz 32×4 e palpites dos três modelos na semente ativa; prefixos são exploratórios, oclusão aparece só para B2/P e referência herdada só em exemplos

#### AC-020 — Metodologia separa resultados do estudo dos palpites locais

- **Dado** a rota `/metodologia`
- **Quando** consulto as 250 execuções e hipóteses
- **Então** vejo médias, variação, C1–C4, vereditos e limitações a partir dos resultados corrigidos versionados, separados dos classificadores reconstruídos usados pela aplicação

#### AC-021 — Fluxos de navegação consomem a API e tratam estados

- **Dado** uma análise iniciada ou consultada
- **Quando** a API responde, está lenta, retorna erro ou ainda processa
- **Então** o cliente usa os endpoints existentes, preserva IDs opacos, apresenta carregando/vazio/erro com orientação e não inventa campos ausentes

### US-012 — Entender exemplos sem atravessar o painel agregado

Como visitante, quero abrir um caso em um clique e comparar os cinco exemplos lado a lado, para entender os palpites no contexto sem confundir um único fluxo com estatística de desempenho.

#### AC-028 — Exemplo mostra o caso antes dos detalhes

- **Dado** um dos cinco exemplos ISCX
- **Quando** aciono seu cartão e a análise termina
- **Então** vejo a referência herdada, B1/B2/P e a evolução dos palpites por pacote numa única tela; detalhes técnicos ficam recolhidos e não aparece porcentagem de concordância sobre um só fluxo

#### AC-029 — Comparação real distingue referência de palpite

- **Dado** a biblioteca de cinco exemplos
- **Quando** abro a comparação
- **Então** vejo uma linha por caso com rótulo herdado, palpites e estabilidade dos três modelos obtidos pela API, estados de carga/erro e ligação ao caso; o upload continua usando o painel agregado

## Fora de escopo

- Corrigir a divergência científica AC-002, treinar modelos no navegador ou apresentar resultados dos modelos locais como substitutos das tabelas do estudo.
- Hospedagem, DNS, Docker Compose, CI/CD e envio de pcaps reais.
- Inventar IPs, portas, topologia, tráfego cifrado ou rótulos de referência para uploads.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-011 | O frontend Next.js fica sob `web/` e usa o App Router descrito na documentação do sistema. | confirmada | O repositório não tinha pasta de frontend; seguir README e `docs/DESIGN.md`. |
| ASM-012 | Verificação local pode usar build/typecheck e testes de componentes sem exigir serviços externos. | confirmada | API e Redis serão simulados nos testes; integração de deploy fica fora de escopo. |
| ASM-015 | A comparação pode processar sob demanda os cinco exemplos pequenos, sem reutilizar ou reenviar capturas do usuário. | confirmada | Cada exemplo da biblioteca contém um fluxo; a comparação consulta a API e guarda IDs na sessão do navegador. |

## Perguntas em aberto

Nenhuma.
