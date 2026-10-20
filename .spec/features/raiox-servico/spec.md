# Spec: Serviço de análises Raio-X

> feature: raiox-servico
> status: em-implementacao

## Contexto

Fase 2 do README: expor análises por API, processar capturas fora da requisição e persistir somente metadados anônimos por até sete dias. O backend usa os classificadores locais cuja divergência científica está registrada; nenhuma rota pode apresentar palpites como rótulos ou como desempenho do estudo.

## Histórias

### US-007 — Iniciar e acompanhar uma análise

Como visitante, quero enviar uma captura ou escolher um exemplo e acompanhar seu processamento, para ver o experimento aplicado sem esperar numa requisição longa.

#### AC-008 — Upload validado cria uma análise opaca

- **Dado** um upload `.pcap`/`.pcapng` válido dentro do limite de 200 MB
- **Quando** `POST /api/analises` recebe a requisição
- **Então** armazena temporariamente com nome aleatório, cria ID aleatório de 12 caracteres, enfileira trabalho e retorna `202` com o ID
- **E** não devolve nem persiste o nome de caminho fornecido pelo cliente
- **E** rejeita extensão, conteúdo ou tamanho inválido sem deixar arquivo órfão

#### AC-009 — Exemplo cria análise sem upload

- **Dado** um nome de exemplo presente em `exemplos/biblioteca.json`
- **Quando** `POST /api/analises/exemplo/{nome}` é chamado
- **Então** agenda análise dos metadados do exemplo, preserva a origem/rótulo herdado da captura e não classifica como fluxo rotulado independente
- **E** nome inexistente recebe `404`

### US-008 — Processar e consultar resultados anônimos

Como visitante, quero consultar estado e resultados sem expor identificadores da captura, para comparar palpites por semente e inspecionar fluxos.

#### AC-010 — Worker processa e remove captura temporária

- **Dado** um trabalho enfileirado
- **Quando** o worker extrai e classifica até 500 fluxos principais
- **Então** atualiza os estados `recebida`, `extraindo`, `classificando`, `pronta` ou `erro` e contadores de progresso
- **E** remove o pcap em `finally`, inclusive em falha
- **E** persiste somente metadados e palpites, sem IP, porta, payload ou bytes crus

#### AC-011 — API retorna resumo e fluxos paginados

- **Dado** uma análise pronta
- **Quando** consulto status, lista paginada ou detalhe de fluxo
- **Então** recebo contagens, motivo de parada, palpites de B1/B2/P por semente e metadados permitidos pelo README
- **E** uploads não recebem rótulo de referência ou métricas de acerto; apenas exemplos podem carregar o rótulo herdado da captura
- **E** IDs inexistentes retornam `404` e limites de paginação são aplicados

### US-009 — Limitar retenção e abuso

Como responsável pelo serviço, quero limitar carga e apagar dados temporários/expirados, para reduzir exposição e proteger a VPS.

#### AC-012 — Limites operacionais são aplicados

- **Dado** uma requisição ou tarefa que excede os limites definidos no README
- **Quando** a API/worker valida o trabalho
- **Então** limita upload a 200 MB, leitura a 3 milhões de pacotes, extração a 2.000 fluxos (500 principais), processamento a cinco minutos e uma execução simultânea
- **E** devolve erro seguro, sem caminho local nem rastreamento interno

#### AC-013 — Análises e arquivos órfãos expiram

- **Dado** análise com mais de sete dias ou arquivo temporário sem análise ativa
- **Quando** a rotina periódica de limpeza é executada
- **Então** apaga arquivo e registros expirados, preservando análises ainda dentro do prazo

#### AC-014 — Persistência contém apenas campos permitidos

- **Dado** uma análise ou fluxo que será salvo
- **Quando** os modelos e schemas de persistência são usados
- **Então** persistem somente estado, contagens, agregados, amostra limitada de metadados e previsões
- **E** não existem campos para IP, porta, payload ou bytes crus; JSON e timestamps são legíveis em SQLite e PostgreSQL
- **E** a migração inicial cria as tabelas, constraints e exclusão em cascata previstas

## Fora de escopo

- UI web, publicação externa, DNS, VPS e envio de capturas reais.
- Login, cookies de rastreamento, gravação de payload, IPs ou portas.
- Alterar os dados científicos ou ocultar a divergência entre modelos locais e referências do estudo.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-008 | Testes de API e worker podem usar SQLite e Redis fake/in-memory, sem serviços externos. | confirmada | Escopo é validação local; os tipos de banco serão compatíveis com PostgreSQL na implantação. |
| ASM-009 | A API usará filesystem temporário configurável e fila RQ; os serviços só serão expostos internamente. | confirmada | Contratos definidos no README; deployment fica em fase posterior. |
| ASM-010 | Os IDs de análise não são credenciais, mas devem ter entropia suficiente e não conter dados do usuário. | confirmada | UUID/segredo aleatório codificado em 12 caracteres; rate limit por IP continua obrigatório. |

## Perguntas em aberto

Nenhuma.
