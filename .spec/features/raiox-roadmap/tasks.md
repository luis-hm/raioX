# Tasks: Raiox roadmap

> feature: raiox-roadmap

<!--
  Como ler este arquivo (o formato é verificado por `onp-spec audit`):
  - T-xxx = tarefa (código de rastreio, único no projeto inteiro).
  - Toda tarefa referencia em `Refs:` pelo menos uma história de usuário
    (US-xxx) ou critério de aceite (AC-xxx).
  - Toda tarefa lista os arquivos que cria/altera em `Arquivos:` — capriche:
    é o que decide o que `onp-spec plano` roda em PARALELO (arquivos
    disjuntos) e o que roda em sequência.
  - Campos opcionais por tarefa, usados pelo plano de execução:
    `- Modelo: claude-sonnet-5` e `- Esforço: alto` (baixo|medio|alto|xalto|max).
  - Uma tarefa só pode virar [concluida] quando os critérios de aceite dela
    tiverem prova PASS registrada por `onp-spec verify`.
  Status: pendente | em-andamento | concluida
    (atalho: `onp-spec tarefa <feature> <T-xxx> <status>`)
-->

## T-019 — Reconciliar README com a interface entregue [concluida]

- Refs: US-011, AC-022
- Arquivos: README.md, tests/test_raiox_interface.py
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: telas e estados implementados marcados; estados de processamento enumerados; revisão visual de 390/1440 px permanece pendente. Corrigida a afirmação de que upload/exemplo não estavam conectados: `StartAnalysis` chama a API. Teste documental AC-022 e suíte `tests.test_raiox_interface` passaram 14/14.

## T-020 — Preparar execução containerizada e limpeza [concluida]

- Refs: US-011, AC-024
- Arquivos: Dockerfile.api, web/Dockerfile, docker-compose.yml, .dockerignore, .env.example, .gitignore, tests/test_containers_contract.py, README.md
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: Dockerfiles Python e Next standalone, Compose com Postgres/Redis/API/worker/migração/limpeza/web, rede interna, web publicado somente em loopback, worker não-root com limite de memória, `.env.example` e exclusão de segredos. `docker compose config --quiet` e 4 testes de contrato passaram. O daemon Docker está inacessível no sandbox, então não foi possível build/run dos containers; VPS/DNS continuam pendentes.

## T-021 — Preparar workflow de deploy seguro [concluida]

- Refs: US-011, AC-024, AC-025
- Arquivos: .github/workflows/deploy.yml, tests/test_deploy_workflow_contract.py, README.md
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: workflow em push na `main` e acionamento manual, com concorrência serial, nenhuma Action de terceiros, known_hosts estrito, temporários com permissão 600, validação de host/caminho e falha antecipada sem configuração. Testes locais: 3/3. Nenhuma conexão foi iniciada; falta cadastrar `VPS_HOST`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY`, `VPS_KNOWN_HOSTS` e variável `VPS_DEPLOY_PATH`, além da VPS preparada.

## T-022 — Comparar concordância entre modelos [concluida]

- Refs: US-011, AC-023
- Arquivos: web/components/ui/LivePanel.tsx, web/lib/api.ts, web/lib/api.contract.test.cjs, tests/test_raiox_interface.py, README.md
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: resumo por semente agrega iguais/diferentes para B1–B2, B1–P e B2–P com palpites disponíveis dos fluxos principais; API mantém o campo legado. UI apresenta contagens/percentual e ressalva que não é acurácia, sem usar rótulos. Testes específicos de agregação e interface passaram com `.venv/bin/python`; `npm run typecheck` e `node web/lib/api.contract.test.cjs` também passaram. AC-023 foi verificado em conjunto com as demais entregas extras.

## T-023 — Exportar fluxos em CSV [concluida]

- Refs: US-011, AC-023
- Arquivos: web/components/ui/LivePanel.tsx, web/lib/flow-export.ts, web/lib/flow-export.contract.test.cjs, tests/test_raiox_interface.py, README.md
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: botão exporta apenas `flows.itens` da página carregada, respeitando semente, modelo e filtros correntes, sem novas requisições. CSV UTF-8/BOM, quoting, neutralização de fórmulas iniciadas por `= + - @ tab CR`, números intactos e nome opaco estático; whitelist exclui análise/id, referência e quaisquer campos sensíveis. Contrato CSV e API passaram; typecheck passou; `.venv/bin/python -m unittest tests.test_raiox_interface` passou 17/17 após T-024.

## T-024 — Simular perda de pacotes sem alterar resultados publicados [concluida]
- Refs: US-011, AC-023
- Arquivos: web/components/motion/packet-loss.ts, web/components/motion/PacketLossControls.tsx, web/components/motion/FlowXRay.tsx, web/components/motion/PacketLadder.tsx, web/components/motion/xray.module.css, web/app/dev/componentes/page.tsx, web/lib/packet-loss.contract.test.cjs, tests/test_raiox_interface.py, README.md, docs/DESIGN.md, .spec/features/raiox-roadmap/spec.md
- Modelo: gpt-6-astra
- Esforço: alto
- Notas: execução sequencial; simulação somente visual para exemplos/uploads, desativada inicialmente, níveis 0/10/20% e semente visual 0–4 independente dos modelos. Seleção pura e determinística sobre até 100 pacotes, antes do corte visual de 32, com índices originais e contagens arredondadas explícitas. Escada sinaliza ×/seta interrompida/texto; tabela lista retidos/perdidos sem depender da reprodução. Matriz e barras mantêm entrada original completa; prefixos/oclusões explicitamente originais. Nenhuma mutação, reclassificação, persistência, chamada à API ou métrica simulada; C4 não foi alterado. Em 20/10/2026 passaram o contrato de seleção/renderização (entradas congeladas, tamanhos 0/1/3/5/24/32/33/100, sementes, níveis, exemplos/uploads, retorno ao estado desativado), seis contratos web, typecheck e 17/17 testes de interface. A prova do teste T-024 consta em AC-023. Navegador não iniciou pelo agent-browser neste sandbox; interação real, revisão 390/1440 px e 60 fps continuam sem prova.

## T-025 — Registrar limites e dependências externas do roteiro [concluida]

- Refs: US-011, AC-025
- Arquivos: README.md, .spec/features/raiox-roadmap/spec.md
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: README esclarece que VPS Hostinger/domínio eram proposta, não implantação; marca a seleção atual dos cinco exemplos como definida; registra PCAPs originais/captura própria, DNS/VPS/secrets, revisão visual/GIF e execução do novo experimento como dependências explícitas. O protocolo 10% × 100% foi aprovado e registrado em Q-002; faltam os arquivos de dados para executá-lo. `tests.test_raiox_interface.TestRaioXInterface.test_t025_readme_marca_selecao_de_exemplos_e_dependencias_externas` prova as afirmações de deploy/PCAP e dependências. Nenhum dado externo foi inventado nem serviço acessado.

## T-026 — Preparar comparação pareada 10% × 100% [concluida]

- Refs: US-011, AC-026
- Arquivos: treino/experimento_rotulos.py, treino/PROTOCOLO_FRACAO_ROTULOS.md, tests/test_experimento_rotulos.py, README.md
- Notas: protocolo aprovado pelo usuário: amostra estratificada de 10% por classe do treino, macro-F1 no mesmo teste intocado, cinco sementes pareadas e hiperparâmetros constantes para B1/B2/P. Runner valida dados/saída antes do treino, registra índices selecionados e métricas, e testes usam dados sintéticos com treinamento simulado. `onp-spec verify raiox-roadmap` registrou AC-026 PASS (5/5 critérios do roadmap provados). Execução dos modelos não realizada porque os dados processados/encoders estão ausentes. A tentativa de delegar Sol/médio encontrou indisponibilidade por capacidade; implementação foi concluída localmente sem usar 6.1.

## T-027 — Reorganizar a documentação do repositório [concluida]

- Refs: US-011, AC-027
- Arquivos: README.md, docs/SISTEMA.md, docs/DESIGN.md, tests/test_raiox_interface.py, tests/test_containers_contract.py, tests/test_deploy_workflow_contract.py, .spec/features/raiox-interface/spec.md
- Notas: README técnico preservado como documentação do sistema; DESIGN movido para `docs/`; links internos corrigidos. README de raiz cobre aplicação, arquitetura, execução, testes, privacidade, limites, estado científico e implantação pendente. Testes focais da interface (20), containers (4), deploy (3), aceite AC-027 e links locais Markdown passaram.
