# Registro de execução de T-002

## Implementado

- `core/matriz.py`: matriz 32×4, normalização e 11 estatísticas B1 portadas das Etapas 6 e 8.
- `core/extracao.py`: leitura pcap/pcapng com Ethernet, Linux cooked e IP puro, TCP/UDP, filtros de portas, timeout, limites e retenção de até 100 pacotes; endereços e portas permanecem somente na chave em memória.
- `treino/reproduzir.py`: preparação N/100%, cinco sementes, B1 com 300 árvores, B2/P com CNN, carga dos encoders N correspondentes e comparador contra os arquivos de previsões de teste. Salva normalizações e classificadores num diretório de saída escolhido pelo operador.
- `treino/exportar.py`: exporta B1 e CNNs em ONNX com normalização incorporada no grafo, gera manifests/checksums e comparação com as referências. `artefatos/` contém 15 modelos comprimidos em cinco diretórios de semente (61 MB).
- `resultados_referencia/manifesto.json`: inventaria os cinco CSVs científicos publicados com origem, descrição, contagem de linhas, SHA-256 e exclusões; AC-004 verifica conteúdo e integridade.
- `tests/test_spec_raiox_aplicacao.py`: comparação das matrizes/splits e teste de extração com pcap sintético; AC-002 exige igualdade de todas as 15 previsões.

## Provas executadas

- `./.venv/bin/python -W error -m unittest tests.test_spec_raiox_aplicacao.TestSpecRaioXAplicacao.test_ac_001 tests.test_spec_raiox_aplicacao.TestSpecRaioXAplicacao.test_ac_001_extracao` — **2 testes passaram**.
- Reexecução de B1 nas cinco sementes com Python 3.13.16/scikit-learn 1.6.1: divergências por semente **13/1.050, 16/1.337, 18/970, 6/939 e 7/1.060** (60/5.356 no total).
- Execução do `scripts/etapa6.py` original, com apenas o caminho de dados apontado para a cópia local, em Python 3.12 e 3.13/scikit-learn 1.6.1: a semente 0 divergiu nos mesmos 13 casos que o port. As 11 features do treino são bit a bit iguais entre o original e o port; os vetores de treino, rótulos e rótulos de teste também coincidem.
- Os arquivos finais C1 B1 das sementes 0–2 são idênticos aos arquivos do piloto P6 correspondentes. As métricas registradas também coincidem. Os arquivos P6 das sementes 3–4 não estão disponíveis; nenhum classificador final B1 foi encontrado no ZIP ou na pasta extraída.
- A variante histórica de feature que inclui o intervalo zero do primeiro pacote produziu mais divergências (84–189 por semente), portanto não explica os arrays finais.
- Variar `n_jobs` entre 1, 2 e todos os CPUs e limitar threads OpenMP a 1, 2 ou 4 não alterou as divergências.
- Execução dos dez modelos B2/P concluída no CPU (sem GPU; `nvidia-smi`: “GPU access blocked by the operating system”). Os tempos de treino ficaram entre 321 e 395 s por modelo. Divergências: B2 s0 **133/1.050**, P s0 **82/1.050**; B2 s1 **633/1.337**, P s1 **155/1.337**; B2 s2 **199/970**, P s2 **292/970**; B2 s3 **164/939**, P s3 **155/939**; B2 s4 **156/1.060**, P s4 **94/1.060**. Total B2+P: **2.063/10.712** previsões diferentes. Comparação e modelos desta tentativa ficam em `/tmp/raiox-cnn-all-seeds`, fora do repositório.
- `onp-spec verify raiox-aplicacao`: **3/4 critérios passaram**, 6 testes lidos. AC-001, AC-003 e AC-004 PASS; AC-002 FAIL com 15/15 pares divergentes. `onp-spec audit --ci` termina com 1 erro: AC-002 falhou; pergunta Q-001 está respondida. A tentativa de regenerar o plano em `.spec` não pôde escrever no ledger externo `~/.onp-spec/painel/ledger.jsonl` por permissão de filesystem.

## Estado

- AC-001: **provado** pelos testes de matrizes, divisões, normalização e pcap sintético.
- AC-002: **não satisfeito**. B1 diverge em **60/5.356** previsões e B2/P em **2.063/10.712**. Nenhum dos 15 modelos satisfaz a igualdade de previsões exigida pela referência. Os classificadores gerados localmente não são considerados artefatos científicos validados.
- T-001, T-003 e T-004 concluídas com prova; T-002 permanece pendente somente pela paridade de AC-002. A decisão Q-001 está respondida: seguir com a reconstituição local e expor as diferenças.

## Próximo passo

Para satisfazer AC-002 ainda é necessário localizar a revisão/código ou os classificadores que geraram as previsões gravadas, ou identificar a diferença de ambiente/protocolo que explique os arrays. Até isso ocorrer, usar os artefatos locais apenas como implementação provisória, não como reprodução fiel do estudo.
