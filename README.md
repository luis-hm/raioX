# Raio-X do Tráfego

![Raio-X do Tráfego](raio-x/raio-x-card-light.svg)

**Classificação de tráfego cifrado só com tamanho, direção e ritmo dos pacotes — sem abrir o conteúdo.**

O Raio-X transforma o trabalho de Redes de Computadores (UFC Russas, Projeto 4) numa aplicação interativa. O experimento foi refeito
do zero a partir das 109 capturas brutas do ISCX VPN-nonVPN e o site mostra o que ele apurou: três modelos (Random Forest, CNN e CNN com
pré-treino auto-supervisionado) tentam dizer se cada fluxo é chat, e-mail, transferência, streaming ou VoIP.

> As classificações são palpites de modelos, não identificação garantida da aplicação nem alerta de segurança. Uploads não têm rótulo para
> medir acerto; desempenho só é medido no conjunto de teste rotulado do ISCX.

## O que você pode fazer

- **Ver a análise do ISCX** (`/analise`): as 98 capturas passam pelo raio-X — leitura, separação por sessão, matrizes 32×4, treino e teste.
- **Ler os resultados** (`/resultados`): veredito das hipóteses H1–H4, poucos rótulos, aplicações não vistas, perda de pacotes, custo,
  codificador congelado, F1 por classe, matriz de confusão, oclusão e exposição de informação.
- **Enviar seus arquivos** (`/enviar`): um `.pcap`, `.pcapng` ou `.zip` com até 20 capturas; o painel mostra os palpites dos três modelos por fluxo,
  concordância, mapa temporal, filtros e exportação CSV.
- **Abrir o raio-X de um fluxo** (`/a/{id}/fluxo/{n}`): escada de pacotes, matriz 32×4, palpites por prefixo e oclusão.
- **Entender o método** (`/metodologia`): o protocolo do pcap ao teste estatístico.

| Rota | Conteúdo |
| --- | --- |
| `/` | Apresentação e o visor do raio-X |
| `/analise` | Análise das capturas do ISCX |
| `/resultados` | Resultados do experimento |
| `/metodologia` | Protocolo e limitações |
| `/enviar` | Upload de capturas e exemplos do ISCX |
| `/a/{id}` · `/a/{id}/fluxo/{n}` | Processamento, painel e raio-X de um fluxo |

## Modelos e contexto científico

Cada fluxo é descrito pelos 32 primeiros pacotes com carga útil numa matriz 32×4: tamanho com direção, intervalo, presença e máscara.
**B1** é um Random Forest sobre 11 estatísticas; **B2** é uma CNN 1D treinada só com rótulos; **P** é a mesma CNN, pré-treinada para reconstruir
15% dos pacotes escondidos, sem rótulos. A divisão é por sessão, com cinco sementes, para nenhuma conversa estar no treino e no teste.

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

experimento/ (offline) ── pcaps brutos → resultados, modelos (artefatos/) e web/data/experimento.json
```

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind e visualizações próprias (canvas e SVG). Identidade em [`docs/DESIGN.md`](docs/DESIGN.md).
- **API e worker:** FastAPI, SQLAlchemy/Alembic, `dpkt`, NumPy, scikit-learn e ONNX Runtime.
- **Experimento:** PyTorch (GPU quando houver), scikit-learn e SciPy, em `experimento/`.

## Início rápido com Docker

Requisitos: Docker Engine, `docker compose` e `make`.

```sh
cp .env.example .env    # troque POSTGRES_PASSWORD e RAIOX_RATE_SECRET; a senha também vai em DATABASE_URL
make run                # web, API, worker, PostgreSQL e Redis
```

Abra [http://127.0.0.1:3000](http://127.0.0.1:3000). Sem o `make`, `docker compose up -d --build` faz o mesmo. `make up` sobe em segundo plano; `make ps`, `make logs` e `make down` acompanham e encerram.
Só o web é publicado no host, em `127.0.0.1`.

## Refazer o experimento

Os resultados exibidos vêm de `python -m experimento.executar`, que lê os pcaps brutos e segue as Etapas 5 a 9 do protocolo:

```sh
pip install -r requirements.txt -r requirements-export.txt          # PyTorch com CUDA é opcional, mas acelera as CNNs
python -m experimento.executar --pcaps /caminho/REDES --base /caminho/saida
```

`--pcaps` é a pasta com `NonVPN-PCAPs-01`, `-02` e `-03` (109 arquivos). A execução é retomável e grava em `--base` os dados processados,
os 250 resultados, as previsões e os pré-treinos; ao final, atualiza `artefatos/` (modelos de N/100% usados pela API), `exemplos/biblioteca.json`
e `web/data/experimento.json` (lido pelas páginas). O passo a passo e a conferência com o relatório estão em [`docs/SISTEMA.md`](docs/SISTEMA.md).

## Desenvolvimento e testes

```sh
make dev                                # backend em containers e Next.js com recarga em http://127.0.0.1:3000
cd web && npm run typecheck             # tipos do frontend
.venv/bin/python tests/run_tap.py       # contratos do backend, da interface e do projeto
```

## Privacidade, limites e uso responsável

- IPs e portas só agrupam pacotes, em memória; nunca são gravados. O conteúdo (payload) não é guardado nem exibido.
- O arquivo enviado é apagado logo após a leitura, inclusive em erro. Resultados anônimos expiram em 7 dias.
- Limites: upload de 200 MB (ZIP com até 20 capturas e 500 MB abertos); leitura de até 3 milhões de pacotes; 2.000 fluxos guardados e 500 classificados;
  até 100 pacotes guardados por fluxo, 32 na matriz; cinco minutos de processamento; 10 análises por IP por hora.
- Os modelos aprenderam com tráfego de laboratório de 2016. Em capturas atuais (TLS 1.3, QUIC) podem errar mais. Não use para monitoramento de produção
  nem decisões de segurança.

## Estado do projeto e resultados

O pipeline, a API, os containers, o experimento refeito e as telas estão implementados e verificados localmente.
**No ar em [https://raiox.codehub.systems](https://raiox.codehub.systems)**: a implantação externa é feita pelo Coolify a partir de [`compose.coolify.yaml`](compose.coolify.yaml), com deploy automático a cada push na `main` (detalhes em `docs/SISTEMA.md`). O workflow `.github/workflows/deploy.yml`, por SSH, é opcional e só roda com os secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_PRIVATE_KEY` e `VPS_KNOWN_HOSTS` e a variable `VPS_DEPLOY_PATH` cadastrados.

**Resultado da execução refeita** (250 execuções, 5 sementes, teste *t* pareado com Holm; detalhes em `/resultados`):

| Macro-F1 médio no teste (N) | 1% | 5% | 10% | 100% |
| --- | --- | --- | --- | --- |
| B1 · Random Forest | 0,267 | 0,373 | 0,424 | **0,543** |
| B2 · CNN | 0,299 | 0,368 | 0,385 | 0,476 |
| P · CNN + pré-treino | 0,279 | 0,370 | 0,401 | 0,436 |

- **H1, H2 e H3 não foram sustentadas; H4 foi confirmada** — as mesmas conclusões do relatório original. Nenhuma diferença P − B2 é significativa.
- As diferenças significativas favorecem o Random Forest: aplicações não vistas em A2 (−15 e −19 pp para o P) e perda de pacotes no C4 (de −5 a −13 pp).
- A Etapa 5 reproduziu os dados do relatório exatamente (5.653 fluxos; testes de vazamento idênticos) e o B1 repetiu os macro-F1 publicados.
  As CNNs diferem um pouco: a regra de escolha de passos na validação apontou 2.000 passos nesta execução (4.000 no relatório) e o treino rodou em outra GPU.

## Estrutura principal

```text
api/                    API, schemas, persistência e limites
core/                   extração PCAP, matrizes, modelos e explicações
experimento/            reexecução das Etapas 5–9 a partir dos pcaps
artefatos/              modelos B1/B2/P de N/100% usados pela API
docs/                   documentação do sistema e do design
exemplos/               cinco fluxos do ISCX para exploração
tests/                  testes e contratos automatizados
treino/                 protocolos e scripts de reprodução anteriores
web/                    aplicação Next.js (web/data: resultado do experimento)
worker/                 fila, processamento assíncrono e retenção
```

## Documentação

- [Documentação do sistema](docs/SISTEMA.md) — escopo, telas, experimento refeito, arquitetura, API, dados, segurança e roteiro.
- [Design da interface](docs/DESIGN.md) — identidade, tokens, paletas validadas, movimento, gráficos e fluxo das telas.
