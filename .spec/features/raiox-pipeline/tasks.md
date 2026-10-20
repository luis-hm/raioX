# Tasks: Análise local de tráfego — Fase 1

> feature: raiox-pipeline

## T-005 — Integrar modelos e comando local de análise [concluida]

- Refs: US-005, AC-005, AC-006
- Arquivos: core/modelos.py, core/analisar.py, tests/test_raiox_pipeline.py
- Modelo: gpt-6-sol
- Esforço: medio
- Notas: Loader ONNX/Joblib e CLI com cinco sementes, detalhe selecionável, saída humana/JSON, aviso de reconstituição local e escores não calibrados. AC-005 e AC-006 passaram no verify oficial.

## T-006 — Preparar biblioteca didática de exemplos [concluida]

- Refs: US-006, AC-007
- Arquivos: treino/preparar_exemplos.py, exemplos/, tests/test_raiox_pipeline.py
- Modelo: gpt-6-luna
- Esforço: baixo
- Notas: cinco exemplos determinísticos com proveniência, matriz 32×4 e `proto` numérico (6/17) derivado diretamente de `meta.csv`; cada exemplo inclui até 100 trios anônimos `[tamanho, direção, tempo_relativo]` copiados de `pk_bruto.npy` (sem reconstrução a partir da matriz transformada). Teste AC-007 valida o vínculo com os metadados originais.
