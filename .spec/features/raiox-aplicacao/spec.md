# Spec: Raio-X do Tráfego

> feature: raiox-aplicacao
> status: em-implementacao

## Contexto

Transformar o experimento de classificação de tráfego em uma aplicação didática. A execução começa pela reprodução dos classificadores e dos dados de referência, conforme a Fase 0 do README.

## Histórias

### US-001 — Reproduzir os modelos do experimento

Como responsável pelo projeto, quero reconstruir B1, B2 e P para as cinco sementes do cenário N com 100% dos rótulos, para que a aplicação use previsões rastreáveis ao experimento.

#### AC-001 — Preparação respeita os dados e divisões originais

- **Dado** o pacote de dados processados e os scripts do experimento
- **Quando** a rotina de preparação e extração é executada
- **Então** ela preserva as cinco classes, a ordem, as divisões por semente e as regras de transformação documentadas no trabalho

#### AC-002 — Quinze classificadores reproduzem as previsões gravadas

- **Dado** os dados de treino, os splits e os encoders pré-treinados N das sementes 0 a 4
- **Quando** B1, B2 e P são reconstituídos em cada semente e avaliados no teste correspondente
- **Então** os 15 classificadores geram previsões iguais às previsões de referência do trabalho, com comparação registrada por método e semente

#### AC-003 — Artefatos exportados preservam a inferência

- **Dado** os classificadores PyTorch e B1 reconstituídos
- **Quando** os artefatos são salvos para uso pela aplicação
- **Então** cada modelo mantém cenário, semente, versão e normalização identificados, e B2/P exportados para ONNX reproduzem as previsões PyTorch

#### AC-004 — Resultados do estudo ficam separados dos palpites da aplicação

- **Dado** os resultados corrigidos e os arquivos de pilotos ou anteriores à correção de P
- **Quando** os dados de referência são preparados para o produto
- **Então** somente os resultados corrigidos alimentam os gráficos científicos e as fontes excluídas ficam identificadas

## Fora de escopo

- API, worker, banco, interface web, hospedagem e deploy, que serão executados nas fases seguintes do roteiro do README.
- Treinar modelos no site ou escolher a semente pelo melhor resultado no teste.
- Validar desempenho em pcaps originais do ISCX, que não estão no ZIP.

## Suposições

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-001 | O ZIP e os documentos extraídos em `Downloads` e `/tmp/raiox-redes-review` são as fontes locais autorizadas para reproduzir o experimento. | confirmada | O usuário pediu a execução do plano com base no ZIP previamente indicado. |
| ASM-002 | A versão de referência do scikit-learn é 1.6.1; igualdade exata das previsões depende também do ambiente original de treino. | confirmada | Testado com scikit-learn 1.6.1 em Python 3.12 e 3.13; ambos divergem em 13 previsões B1 da semente 0. |
| ASM-003 | Testes com pcaps usarão fixtures sintéticas até que capturas originais estejam disponíveis. | confirmada | O ZIP contém fluxos processados, não pcaps originais. |

## Perguntas em aberto

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-001 | Você consegue fornecer a revisão exata do código ou os classificadores B1 finais que geraram as previsões? Se não, autoriza prosseguir com os classificadores reconstituídos localmente, documentando as divergências observadas? | respondida | O usuário determinou executar o plano sequencialmente; isso foi tratado como autorização para prosseguir com a reconstituição local e registrar as diferenças. A paridade científica continua não comprovada: B1 60/5.356; B2/P 2.063/10.712. Não afirmar que os artefatos locais reproduzem os classificadores originais. |
