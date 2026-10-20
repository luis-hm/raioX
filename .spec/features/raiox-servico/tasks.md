# Tasks: Serviço de análises Raio-X — Fase 2

> feature: raiox-servico

## T-007 — Modelos de persistência e migração inicial [concluida]

- Refs: US-008, AC-014
- Arquivos: api/models.py, api/database.py, api/schemas.py, alembic/, requirements-service.txt, tests/test_raiox_servico.py
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: SQLAlchemy com JSON portável (JSONB em PostgreSQL), timestamps UTC, estado/origem e cascata de fluxos; três testes SQLite (migração, constraints e serialização) passaram. AC-014 separado de AC-011.

## T-008 — API de upload, exemplos e consulta [concluida]

- Refs: US-007, US-008, AC-008, AC-009, AC-011
- Arquivos: api/main.py, api/deps.py, api/schemas.py, tests/test_raiox_servico.py
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: FastAPI com upload limitado e checagem de assinatura, enqueue injetável, exemplos controlados, status, filtros e lista/detalhe paginados. AC-008/009/011 aprovados no verify oficial.

## T-009 — Worker RQ e ciclo de vida do pcap [concluida]
- Refs: US-008, AC-010, AC-011, AC-012
- Arquivos: worker/tasks.py, worker/queue.py, core/analisar.py, core/extracao.py, tests/test_raiox_servico.py
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: Progresso incremental durante extração; processar upload ou exemplo (incluindo matriz/pacotes anonimizados e protocolo da biblioteca derivado de `meta.csv`), persistir palpites de todas as sementes e remover pcap em `finally`. `verify raiox-servico`: AC-010 PASS, com progresso, limite de 500, timeout e limpeza.

## T-010 — Limpeza, retenção e limites de serviço [concluida]
- Refs: US-009, AC-012, AC-013
- Arquivos: api/limites.py, worker/limpeza.py, tests/test_raiox_servico.py
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: Rate limit Redis atômico por IP (HMAC, janela fixa de 1h, 10 criações compartilhadas entre upload/exemplo; indisponibilidade falha fechada), lock Redis global com espera limitada, limpeza UTC inclusiva e arquivos antigos com nome regular gerado pela API. Testes focados passaram 19/19; AC-012 e AC-013 aprovados no verify oficial.
