# Tasks: Raio-X do Tráfego — Fase 0

> feature: raiox-aplicacao

## T-001 — Preparar fontes e separar os resultados finais [concluida]

- Refs: US-001, AC-004
- Arquivos: treino/, resultados_referencia/, .gitignore, tests/test_spec_raiox_aplicacao.py
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: Fontes identificadas e arquivos corrigidos copiados. AC-004 passou no teste dedicado.

## T-002 — Reproduzir extração, matrizes e classificadores [pendente]

- Refs: US-001, AC-001, AC-002
- Arquivos: core/__init__.py, core/extracao.py, core/matriz.py, treino/__init__.py, treino/reproduzir.py, tests/test_spec_raiox_aplicacao.py
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: AC-001 passou incluindo fixture pcap sintética. AC-002 segue pendente: B1 diverge em 60/5.356 e B2/P em 2.063/10.712 previsões. Treino e comparações completos; o ZIP não contém os classificadores finais nem a revisão exata que gerou os arrays. As diferenças ficam registradas sem alegar paridade.

## T-003 — Exportar e verificar artefatos dos modelos [concluida]

- Refs: US-001, AC-003
- Arquivos: treino/reproduzir.py, treino/exportar.py, requirements.txt, requirements-export.txt, artefatos/, tests/test_spec_raiox_aplicacao.py
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: 15 artefatos gerados em cinco diretórios por semente; 10 ONNX preservam as classes PyTorch no teste. Manifestos incluem versões, normalização, checksums e divergências da referência. AC-003 passou; AC-002 continua pendente em T-002.

## T-004 — Preparar dados científicos versionados [concluida]

- Refs: US-001, AC-004
- Arquivos: resultados_referencia/, tests/test_spec_raiox_aplicacao.py
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: `resultados_referencia/manifesto.json` registra os cinco CSVs finais com origem, descrição, contagem e SHA-256, além das exclusões. AC-004 verifica hashes, schema, colunas, linhas e exclusões; teste dedicado passou.

