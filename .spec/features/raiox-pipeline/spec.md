# Spec: Análise local de tráfego

> feature: raiox-pipeline
> status: em-implementacao

## Contexto

Fase 1 do README: oferecer um comando local executável para experimentar o fluxo pcap → metadados → matriz 32×4 → classificações. O comando usa os artefatos locais versionados, cuja equivalência com as previsões científicas ainda não foi obtida; toda saída precisa carregar essa ressalva.

## Histórias

### US-005 — Explorar uma captura localmente

Como visitante ou apresentador, quero analisar um `.pcap`/`.pcapng` pelo terminal e receber resultados legíveis, para tornar o experimento concreto antes da interface web.

#### AC-005 — Executar classificação por fluxo e semente

- **Dado** um pcap/pcapng válido e os artefatos locais B1/B2/P das sementes 0–4
- **Quando** o comando `python -m core.analisar` é executado
- **Então** ele informa pacotes lidos, motivo de parada, fluxos válidos/principais e palpites de B1/B2/P por semente, com opção de selecionar uma semente para inspeção detalhada
- **E** distingue previsão do modelo de rótulo de referência e registra que os artefatos são reconstruções locais divergentes da referência do estudo

#### AC-006 — Proteger dados sensíveis da captura

- **Dado** qualquer pcap/pcapng analisado
- **Quando** o resultado é exibido ou serializado
- **Então** não inclui IPs, portas, payload, endereços de enlace nem bytes crus; limita cada fluxo aos metadados didáticos definidos pelo projeto

### US-006 — Conhecer exemplos do conjunto ISCX

Como visitante sem uma captura própria, quero abrir cinco exemplos já extraídos, um por categoria, para experimentar a interface e entender que o rótulo foi herdado da captura.

#### AC-007 — Exemplos têm proveniência e rótulo limitado à captura

- **Dado** `dataset.npz`, `pk_bruto.npy` e `meta.csv` do pacote processado
- **Quando** a biblioteca de exemplos é preparada
- **Então** ela contém exatamente um fluxo principal por classe, com matriz 32×4, até 100 trios anônimos de pacote `[tamanho, direção, tempo_relativo]`, aplicação, sessão e arquivo de origem identificados
- **E** informa que a categoria é o rótulo atribuído à captura, não uma verificação independente do fluxo
- **E** não contém IP, porta, payload nem bytes crus, e a seleção segue regra determinística que não usa acerto dos modelos

## Fora de escopo

- Upload web, API, fila, persistência e telas, que são fases seguintes do README.
- Declarações de equivalência com o estudo enquanto AC-002 da feature `raiox-aplicacao` estiver falhando.
- Tráfego ao vivo, pcaps públicos de terceiros e validação de desempenho científico em capturas novas.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-005 | O usuário autorizou seguir com os classificadores locais e destacar suas divergências da referência. | confirmada | Ordem explícita para executar o plano; divergências B1 60/5.356 e B2/P 2.063/10.712 estão publicadas no README e nos manifests. |
| ASM-006 | O comando usará artefatos locais em `artefatos/n_s0..n_s4`, sem download automático. | confirmada | Os 15 artefatos ONNX/Joblib e normalizações estão versionados no workspace. |
| ASM-007 | Os cinco exemplos serão o primeiro fluxo principal de cada classe na ordem do conjunto, evitando seleção por desempenho do classificador. | confirmada | Regra determinística proposta para reduzir cherry-picking; a biblioteca preservará arquivo/sessão/aplicação como proveniência. |

## Perguntas em aberto

Nenhuma.
