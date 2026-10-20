# Raio-X do Tráfego

**Uma aplicação didática para explorar o que modelos de aprendizado de máquina conseguem — e não conseguem — inferir a partir dos metadados de fluxos de rede.**

O Raio-X transforma o experimento acadêmico em uma experiência interativa: a pessoa envia uma captura `.pcap`/`.pcapng` ou escolhe um exemplo preparado, acompanha a extração e compara palpites de três modelos. No detalhe de um fluxo, pode sincronizar a sequência de pacotes com a matriz de entrada e explorar como as previsões variam. O sistema não inspeciona nem armazena o conteúdo (payload) dos pacotes.

> **Importante:** as classificações são palpites, não identificação garantida da aplicação, prova de tráfego cifrado, alerta de segurança ou avaliação de acurácia. Uploads não têm rótulos conhecidos para calcular desempenho. As animações da página de demonstração usam dados sintéticos e são identificadas como ilustrações.

## O que você pode fazer

- Enviar uma captura de rede compatível ou começar por um dos cinco exemplos ISCX, um por classe.
- Acompanhar o processamento e navegar pelos fluxos extraídos, com filtros, paginação, mapa temporal anônimo e exportação CSV.
- Comparar, na mesma semente, as previsões de B1, B2 e P; observar concordância entre modelos e estabilidade entre cinco sementes.
- Abrir o raio-X de um fluxo: ver pacotes anonimizados, matriz 32×4, probabilidades e explicações exploratórias por prefixo e oclusão.
- Usar o simulador visual de perda de pacotes (0%, 10% ou 20%) para discutir limitações da observação. Ele não altera a entrada, não reclassifica e não muda resultados experimentais.
- Consultar a metodologia, as tabelas publicadas e as ressalvas do experimento.

## Aplicação

| Rota | Conteúdo |
| --- | --- |
| `/` | Apresentação, upload e seleção de exemplo |
| `/a/{id}` | Estado da análise, resumo, filtros e lista de fluxos |
| `/a/{id}/fluxo/{n}` | Detalhe e raio-X do fluxo selecionado |
| `/metodologia` | Contexto do estudo, comparação dos modelos e resultados de referência |
| `/dev/componentes` | Galeria de componentes e demonstrações sintéticas, não resultados de uma captura |

## Modelos e contexto científico

O sistema aplica três métodos à classificação de fluxos em **chat, e-mail, transferência, streaming e VoIP**:

- **B1:** Random Forest;
- **B2:** rede neural convolucional (CNN);
- **P:** a mesma arquitetura CNN de B2, com pré-treino.

Para cada fluxo, a aplicação representa até os primeiros 32 pacotes com carga útil em uma matriz 32×4 construída a partir de tamanho, direção, intervalo e máscara de presença. Os palpites da análise ao vivo vêm de modelos locais reconstruídos no cenário N, com 100% dos rótulos e cinco sementes. Eles **não são equivalentes** aos classificadores originais do estudo: a reconstrução divergiu em comparações com previsões salvas. Por isso, os artefatos publicados e os resultados de uploads são mantidos separados; as previsões reconstruídas não devem substituir as tabelas do trabalho.

O estudo original avaliou um conjunto e um protocolo específicos. A interface acrescenta exploração visual, uploads e análises que não fizeram parte daquela avaliação. Prefixos e oclusões são explorações de sensibilidade dos modelos locais — não explicações causais, nem reprodução garantida do experimento. Probabilidades não calibradas não devem ser lidas como confiança ou chance de acerto.

## Arquitetura

```text
Navegador (Next.js / TypeScript)
        │ /api — proxy do Next
        ▼
API FastAPI ── Redis / RQ ── worker de análise
        │                         │
        └──── PostgreSQL ◄────────┘
                    │
             limpeza periódica
```

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS e componentes de visualização próprios.
- **API e processamento:** FastAPI, SQLAlchemy/Alembic, `dpkt`, NumPy e scikit-learn/ONNX Runtime para os artefatos de inferência.
- **Execução assíncrona:** Redis e RQ separam o recebimento da captura do processamento pelo worker.
- **Persistência:** PostgreSQL no Compose; a camada de serviço também tem contratos para SQLite em testes.
- **Ambiente local:** Docker Compose com serviços de banco, fila, migração, API, worker, limpeza e web. Só o web é publicado no host, preso a `127.0.0.1` por padrão.

## Início rápido com Docker

Requisitos: Docker Engine com o plugin `docker compose` e espaço para construir as imagens e processar capturas. Na raiz do repositório:

```sh
cp .env.example .env
```

Edite `.env`: substitua `POSTGRES_PASSWORD` e `RAIOX_RATE_SECRET` por valores fortes e únicos. Mantenha a senha igual na URL `DATABASE_URL`; codifique caracteres reservados na URL. Não compartilhe nem versione esse arquivo.

```sh
docker compose up -d --build
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000). Para acompanhar os serviços:

O envio aceita `.pcap` e `.pcapng` individuais ou um `.zip` com até 20 capturas desses formatos. O arquivo enviado tem limite de 200 MB; as capturas descompactadas somadas, 500 MB. Cada ZIP cria uma nova análise combinada (não altera uma análise anterior). O painel reúne os palpites por fluxo, sem inventar uma linha do tempo comum entre arquivos. Até 2.000 fluxos são guardados e 500 recebem palpites; se o limite for atingido, o painel avisa que o resultado é parcial.

```sh
docker compose ps
docker compose logs -f web api worker
```

Para encerrar os serviços sem apagar os dados persistidos:

```sh
docker compose down
```

O Compose executa a migração antes de iniciar os consumidores da API. A limpeza remove análises expiradas e arquivos temporários órfãos. O limite de criação é de 10 análises por IP por hora; sem segredo de rate limit ou sem Redis, a criação falha fechada.

## Desenvolvimento e testes

O frontend pode ser executado separadamente após instalar as dependências do projeto:

```sh
cd web
npm ci
npm run dev
```

O typecheck do frontend é executado com `npm run typecheck` dentro de `web/`. Os contratos automatizados do backend e do projeto podem ser executados pelo runner:

```sh
.venv/bin/python tests/run_tap.py
```

No estado atual, a suíte tem uma falha conhecida em `AC-002`: a reconstrução local dos classificadores não reproduz todas as previsões gravadas no estudo. A divergência está registrada em [`treino/EXECUCAO_T002.md`](treino/EXECUCAO_T002.md); não é uma falha de instalação e não deve ser escondida como se os modelos fossem equivalentes. Os outros critérios são reportados pelo runner individualmente.

O ambiente Python para treino está em `requirements.txt`; a imagem da API e do worker usa `requirements-service.txt`, que inclui ONNX Runtime e dispensa PyTorch/CUDA. Os requisitos de exportação/modelos ficam em `requirements-export.txt`. Para executar uma captura no pipeline de linha de comando, consulte `python -m core.analisar --help` e a documentação do sistema.

## Privacidade, limites e uso responsável

- Endereços IP e portas são usados somente em memória para agrupar os pacotes; não são persistidos nos registros da análise. O payload não é armazenado nem exibido.
- O arquivo PCAP original é temporário e removido após extração, inclusive em falhas tratadas. Resultados anonimizados da análise expiram em sete dias.
- Limites operacionais atuais: upload de 200 MB; leitura de até 3 milhões de pacotes; até 2.000 fluxos extraídos e 500 fluxos principais classificados; até 100 pacotes guardados por fluxo, dos quais no máximo 32 entram na matriz do modelo; processamento com prazo de até cinco minutos.
- A API aceita `.pcap`, `.pcapng` e ZIP com esses formatos, validando os arquivos antes de processá-los. Capturas malformadas, formatos não suportados e análises interrompidas podem falhar ou resultar em leitura parcial.
- Resultados dependem da qualidade, ponto de captura e representatividade dos dados. Não use esta aplicação para monitoramento de produção, resposta a incidentes ou decisões de segurança.

Esses limites e o contrato exato de retenção, APIs, dados e explicações estão detalhados em [`docs/SISTEMA.md`](docs/SISTEMA.md). A proposta visual e as regras de interface estão em [`docs/DESIGN.md`](docs/DESIGN.md).

## Estado do projeto e resultados

O pipeline, a API, os serviços de container e as principais telas estão implementados. Isso não significa que a implantação pública esteja concluída: **implantação externa, domínio, VPS e proxy ainda não foram validados; nenhum deploy foi executado**. A automação de deploy ficou fora deste envio.

A comparação adicional de treino com 10% e 100% dos rótulos está protocolada — 10% estratificados no treino, teste intocado, cinco sementes pareadas e macro-F1 — mas ainda não foi executada: faltam neste workspace os dados processados e encoders necessários. Consulte [`treino/PROTOCOLO_FRACAO_ROTULOS.md`](treino/PROTOCOLO_FRACAO_ROTULOS.md), o [registro da reconstrução](treino/EXECUCAO_T002.md) e o [manifesto dos resultados publicados](resultados_referencia/manifesto.json). Nenhum desses resultados é substituído por uma execução local.

## Estrutura principal

```text
api/                    API, schemas, persistência e limites
core/                   extração PCAP, matrizes, modelos e explicações
docs/                   documentação do sistema, design e referências visuais
exemplos/               biblioteca determinística dos cinco exemplos
resultados_referencia/  resultados científicos versionados e manifesto
tests/                  testes e contratos automatizados
treino/                 protocolos e scripts de reprodução experimental
web/                    aplicação Next.js
worker/                 fila, processamento assíncrono e retenção
docker-compose.yml      ambiente local completo
```

## Documentação

- [Documentação do sistema](docs/SISTEMA.md) — escopo, telas, arquitetura, ciclo de vida, API, modelo de dados, segurança, limites, status e roteiro.
- [Design da interface](docs/DESIGN.md) — direção visual, referências, tokens, componentes, movimento e responsividade.
- [Protocolo 10% × 100%](treino/PROTOCOLO_FRACAO_ROTULOS.md) — desenho da comparação adicional ainda pendente de execução.
- [Resultados de referência](resultados_referencia/manifesto.json) — origem, contagens e hashes dos arquivos publicados.
