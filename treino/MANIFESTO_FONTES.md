# Manifesto das fontes de treinamento e resultados de referência

Este diretório registra de onde vieram os dados científicos usados pelo Raio-X.
Os arquivos tabulares copiados para `../resultados_referencia/` foram obtidos de:

`/tmp/raiox-redes-review/trabalho de redes/projeto_trafego/resultados/`

Essa pasta é a cópia extraída do ZIP `trabalho de redes-20261019T234840Z-1-001.zip`,
originalmente localizado em Downloads do Windows.

## Incluídos

- `resultados/resultados.csv`: tabela final consolidada, com a correção da
  avaliação do método P. É a fonte de resultados por execução.
- `resultados/etapa9_medias_ic95.csv`: médias, desvios-padrão e intervalos de
  confiança da Etapa 9.
- `resultados/etapa9_testes_pareados.csv`: comparações pareadas e valores
  ajustados da Etapa 9.
- `resultados/etapa9_h3_quedas.csv`: análise de quedas sob perda de rótulos da
  Etapa 9 (H3).
- `resultados/etapa9_skype_N.csv`: resultados por categoria para Skype e outras
  aplicações no cenário N.

As cópias selecionadas estão em `../resultados_referencia/`. Não editar essas
cópias manualmente; alterações científicas devem ser feitas na fonte do
experimento e então copiadas novamente com atualização deste manifesto.

Para a página `/resultados`, também foram obtidos diretamente da pasta
compartilhada `trabalho de redes/projeto_trafego/resultados/`:
`exposicao_informacao.csv` (em `auxiliares/`), as 15 previsões finais de
`previsoes/C1_N_*_frac100_seed*.npz` (em `previsoes/`) e as figuras
`figuras/oclusao_B2.png` e `figuras/oclusao_P.png` (em
`web/public/resultados-estudo/`). `resultados_referencia/gerar_painel.py`
recria `web/data/resultados_estudo.json` usando essas fontes e as cinco tabelas
acima. O `resultados.csv` e as quatro tabelas da Etapa 9 foram conferidos
byte a byte com o Drive em 25/10/2026.

A metodologia também usa `contagem_por_aplicacao.csv`, `contagem_particoes.csv`,
`contagem_fracoes.csv` e `escolha_passos_c1.csv`, copiados sem alterações para
`auxiliares/`. O mesmo gerador produz `web/data/metodologia_estudo.json`.

## Excluídos das referências servidas

- `resultados/resultados_piloto.csv` e `resultados/resultados_piloto_v2.csv`:
  pilotos, não representam o conjunto final de execuções.
- `resultados/resultados_antes_correcao_P.csv`:
  resultados anteriores à correção de P; não usar em gráficos ou comparações.
- `resultados/previsoes_antes_correcao_P/`:
  previsões antigas associadas à versão anterior à correção.
- `dados_processados/dataset.npz`, `dados_processados/pk_bruto.npy`,
  `dados_processados/splits.npz` e `dados_processados/fluxos/`:
  dados processados de grande porte; não fazem parte desta preparação.
- `modelos/*.pt`:
  checkpoints de pré-treinamento; não fazem parte desta preparação.
- Outras tabelas auxiliares, logs, scripts e figuras não usados na página de
  resultados não foram copiados.

Os arquivos excluídos permanecem na fonte extraída; esta organização não os
removeu. Somente `resultados_referencia/` deve ser tratado como fonte tabular
para os gráficos científicos do Raio-X.
