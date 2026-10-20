# Tasks: Interface do Raio-X do Tráfego

> feature: raiox-interface

## T-028 — Jornada curta dos exemplos e comparação [concluida]
- Refs: US-012, AC-028, AC-029
- Arquivos: web/components/ui/StartAnalysis.tsx, web/components/ui/AnalysisView.tsx, web/components/ui/ExampleExperience.tsx, web/components/ui/example.module.css, web/components/ui/FlowDetails.tsx, web/app/exemplos/page.tsx, tests/test_raiox_interface.py, .spec/features/raiox-interface/spec.md
- Notas: painel agregado preservado para uploads; exemplos analisados pela API existente; referência herdada e limites científicos explícitos. Typecheck, build de produção e 22 testes de interface passaram; comparação com cinco resultados reais, caso individual e controle de pacotes foram verificados no navegador desktop e móvel. Verify da interface provou 9/9 critérios. O audit global ainda acusa AC-002 científico anterior, fora desta tarefa.

## T-011 — Casca, tokens e componentes básicos [concluida]
- Refs: US-010, AC-015
- Arquivos: web/package.json, web/app/, web/components/ui/, web/lib/, web/tailwind.config.ts, web/app/globals.css, tests/test_raiox_interface.py
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: Next.js 16 App Router/TypeScript/Tailwind 3.4; tokens do `DESIGN.md`; shell e primitives. Reauditoria sequencial em sessão Codex com GPT-6-Sol/médio confirmou uma lacuna de contraste na variante de destaque (3,68:1): ela agora usa os tokens existentes e o teste AC-015 calcula o contraste, exigindo pelo menos 4,5:1. Teste focal AC-015, `npm run typecheck` e `npm run build` passaram. Registro da sessão confirma modelo/esforço. Screenshot em navegador bloqueado pelo sandbox; responsividade não foi certificada visualmente. Runtime audit anterior sem vulnerabilidades; ficam avisos de dependências transitivas apenas de desenvolvimento.

## T-012 — PacketLadder, MatrixGrid, ProbBars e tela Raio-X [concluida]
- Refs: US-010, AC-019
- Arquivos: web/components/motion/, web/app/a/[id]/fluxo/[n]/page.tsx, web/app/dev/componentes/
- Modelo: gpt-6-astra
- Esforço: alto
- Notas: implementada tela demonstrativa com valores sintéticos explicitamente identificados; timeline GSAP única sincroniza escada e matriz, enquanto Motion anima apenas as barras. Inclui controles de reprodução/pausa/reinício/velocidade/busca, movimento reduzido, prefixos, estabilidade entre sementes e oclusão apenas B2/P. `python -m unittest tests.test_raiox_interface -v` passou 2/2; `npm run typecheck` e `npm run build` passaram; AC-015 e AC-019 têm prova PASS. Registro de sessão confirma GPT-6-Astra/alto. O verify global retorna exit 1 apenas porque a suíte ainda inclui a falha conhecida AC-002 em `raiox-aplicacao`; nenhum critério verificado desta interface falhou. Captura visual segue bloqueada pelo sandbox.

## T-013 — Painel estático e tabela de fluxos [concluida]

- Refs: US-010, AC-018
- Arquivos: web/app/a/[id]/page.tsx, web/components/ui/, web/lib/
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: visão geral e tabela demonstrativas com oito fluxos sintéticos, quatro indicadores, distribuição por modelo/semente, estabilidade entre sementes, filtros de categoria/discordância, estado vazio e navegação por abas. O mapa fica como estado informativo até T-014; a série temporal aguarda dados reais na T-016. Teste focal AC-018 PASS, verify da interface registra AC-018 PASS (3/3 critérios com prova); `npm run typecheck` e `npm run build` PASS. Registro de sessão confirma GPT-6-Sol/médio. Audit global segue não zero por AC-002 científico e critérios ainda pendentes das próximas tarefas.

## T-014 — Componentes animados compartilhados e mapa [concluida]

- Refs: US-010, AC-018
- Arquivos: web/components/motion/, web/app/dev/componentes/, web/app/a/[id]/page.tsx
- Modelo: gpt-6-astra
- Esforço: alto
- Notas: implementados CountUp, Sparkline, ModelToggle, FlowRibbons e TimelineScrubber com demos em `/dev/componentes`; painel integra seletor de modelo, contadores e fitas anônimas filtradas por início observado. Dados do mapa são explicitamente sintéticos, sem geografia, hosts, IPs, portas ou topologia. Movimento reduzido desliga a animação sem ocultar informação; scrubber tem teclado/ARIA. `python -m unittest tests.test_raiox_interface -v` passou 3/3; `npm run typecheck` e `npm run build` passaram; verify registra AC-015/018/019 PASS. Exit geral 1 persiste por AC-002 de `raiox-aplicacao`, fora deste escopo. Sem verificação visual no browser por bloqueio do sandbox. Registro de sessão confirma GPT-6-Astra/alto.

## T-015 — Início e processamento animados [concluida]

- Refs: US-010, AC-016, AC-017
- Arquivos: web/app/page.tsx, web/app/a/[id]/page.tsx, web/components/motion/, web/app/dev/componentes/
- Modelo: gpt-6-astra
- Esforço: alto
- Notas: landing com PacketStream em Canvas/GSAP, seleção/arrastar/soltar de `.pcap`/`.pcapng` (valida extensão e 200 MB), cinco exemplos ISCX com rótulo herdado, aviso científico e privacidade; estados de processamento com etapas, contadores opcionais, erro e demo interativa, sem fetch nem sucesso inventado. Focal `python -m unittest tests.test_raiox_interface -v` passou 5/5; `npm run typecheck` e `npm run build` passaram. As verificações desta etapa são de contrato visual e deliberadamente não registram AC-016/017 como PASS: iniciar análise e usar estados reais continuam reservados à integração T-016. Verify global registra AC-015/018/019 PASS e retorna exit 1 pelo AC-002 conhecido. Browser visual não disponível no sandbox. Registro de sessão confirma GPT-6-Astra/alto.

## T-016 — Metodologia, cliente API e contrato de dados reais [concluida]

- Refs: US-010, AC-016, AC-017, AC-020, AC-021
- Arquivos: api/main.py, api/models.py, api/schemas.py, core/extracao.py, core/explicar.py, worker/tasks.py, alembic/versions/, tests/test_raiox_servico.py, tests/test_raiox_interface.py, web/app/, web/components/ui/, web/lib/
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: cliente tipado e proxy configurável por `API_URL`; upload/exemplo, polling com estados reais, painel e metodologia usam dados/contratos existentes. O backend acrescenta duração exata do fluxo quando conhecida e `GET /api/analises/{id}/fluxos/{n}/explicar?semente=0`, com prefixos e oclusão em lote para uma semente por requisição. Não infere duração a partir de amostras truncadas; migração preserva duração antiga como desconhecida. `tests.test_raiox_pipeline` + `tests.test_raiox_servico` passaram 29/29; migração SQLite foi testada em upgrade/downgrade; inferência real com artefatos locais produziu 7 prefixos e curvas de oclusão para B2/P. Na reauditoria sequencial, GPT-6-Sol/médio confirmou o contrato e não encontrou lacuna material; os 29 testes e a migração passaram. A interface real do mapa e do raio-X passou à T-017.

## T-017 — Painel e raio-X conectados aos dados reais [concluida]

- Refs: US-010, AC-018, AC-019
- Arquivos: web/app/a/[id]/, web/components/ui/LivePanel.tsx, web/components/ui/FlowDetails.tsx, web/components/motion/FlowXRay.tsx, web/components/motion/FlowRibbons.tsx, web/components/motion/types.ts, web/lib/api.ts, tests/test_raiox_interface.py
- Modelo: gpt-6-astra
- Esforço: alto
- Notas: detalhe chama a explicação apenas para a semente selecionada, adapta probabilidades na ordem de classes do backend, mantém cache/cancelamento/erros e preserva a timeline GSAP. O adaptador valida pacotes e matriz antes do cache para impedir resposta malformada de ficar em estado de sucesso; regressões cobrem matriz incompleta, presença/máscara/preenchimento inválidos e bytes/tempos de pacote inválidos. O mapa pagina sequencialmente até 500 fluxos, usa `duracao_s` exata e contabiliza durações desconhecidas/fluxos fora do limite sem estimá-las. Demos sintéticas continuam identificadas. Após a correção, `node --test web/lib/live-flows.contract.test.cjs` passou; `tests.test_raiox_interface` passou 12/12, `npm run typecheck` e `npm run build` passaram. `verify raiox-interface` havia provado 7/7 critérios antes desta validação extra; revisão interativa no browser segue pendente por restrição de execução. Reauditoria sequencial em sessão Codex com GPT-6-Astra/alto confirmou o modelo e corrigiu validações de payload; build/testes passaram.

## T-018 — README alinhado ao contrato implementado [concluida]

- Refs: US-010, AC-018, AC-019, AC-021
- Arquivos: README.md, tests/test_raiox_interface.py
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: README atualizado com duração observada e `null` quando desconhecida, limite/omissões do mapa, contrato real de `/explicar` (uma semente por chamada, prefixos, oclusão em p.p. e ressalvas didáticas) e separação entre análise real e demonstrações sintéticas. `DESIGN.md` agora esclarece que a duração vem da extração e pode exceder os 100 trios guardados, e define paginação até 500 fluxos com contagem de omissões; um teste documental verifica esse contrato. Os 2 testes documentais e `tests.test_raiox_interface` passaram (13/13); verify da feature registrou 7/7 critérios com prova antes desta atualização. Reauditoria sequencial em sessão Codex com GPT-6-Luna/baixo confirmou o contrato documental e o modelo; nenhum ajuste adicional ao código foi necessário.
