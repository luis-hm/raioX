# Comparação adicional: 10% × 100% dos rótulos

Protocolo aprovado pelo usuário em 20/10/2026: selecionar deterministicamente
10% estratificados por classe do treino N/100% de cada semente; manter intactos
validação e teste; comparar macro-F1 no mesmo teste intocado; repetir nas cinco
sementes pareadas (0–4), com B1, B2 e P e os mesmos hiperparâmetros nas duas
frações. As CNNs mantêm 4000 passos.

Execute com:

```sh
python -m treino.experimento_rotulos \
  --experimento CAMINHO_DO_EXPERIMENTO \
  --saida CAMINHO_NOVO_FORA_DE_resultados_referencia
```

O destino deve ser uma pasta nova e separada do experimento, dos modelos e de
`resultados_referencia/`. O runner valida antes de iniciar que os arquivos de
dados e encoders existem; grava os índices selecionados e as métricas de cada
fração/método/semente numa pasta separada. Não grava previsões por fluxo nem
altera as tabelas publicadas.

Esta execução não foi feita: `dados_processados/dataset.npz`,
`dados_processados/splits.npz`, `dados_processados/meta.csv` e os encoders de
pré-treino não estão no workspace. Solicite os dados originais do experimento
para executar. Além disso, os classificadores locais ainda divergem das
previsões de referência em AC-002; portanto o futuro resultado será um ensaio
local comparativo, não uma substituição da reprodução científica.
