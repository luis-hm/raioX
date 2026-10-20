# Spec: Continuação do roteiro do Raio-X do Tráfego

> feature: raiox-roadmap
> status: em-implementacao

<!--
  Como ler este arquivo (o formato é verificado por `onp-spec audit`):
  - US-xxx = história de usuário · AC-xxx = critério de aceite
    ASM-xxx = suposição · Q-xxx = pergunta em aberto
    São códigos de rastreio: ligam a especificação às tarefas e aos testes.
  - Toda história de usuário precisa de pelo menos um critério de aceite.
  - Todo critério de aceite precisa de Dado/Quando/Então completos.
  - Os códigos são únicos no projeto inteiro (nunca reutilize um número).
  - Suposições e Perguntas em aberto são OBRIGATÓRIAS: se não há nenhuma,
    escreva "Nenhuma." — mas desconfie: quase toda feature esconde uma.
-->

## Contexto

Continuar o roteiro de implementação do README até concluir as entregas que
podem ser feitas e verificadas no workspace, mantendo explícitos os itens que
dependem de dados externos, decisões do usuário ou infraestrutura/credenciais.

## Histórias

<!-- História de usuário: quem precisa, o que precisa e por quê. -->

### US-011 — Completar as entregas locais do roteiro

Como estudante e mantenedor do Raio-X, quero que as fases restantes do roteiro
sejam implementadas e verificadas, sem confundir protótipos locais com deploy
real ou novos experimentos com os resultados científicos publicados.

<!-- Critério de aceite: o resultado observável que um teste consegue checar.
     Escreva para GENTE: título e Então descrevem o que o usuário vê
     ("a tela avisa X"), não o detalhe técnico ("endpoint retorna 403") —
     o detalhe pode ir entre parênteses. -->

#### AC-022 — README reflete o estado comprovado da interface

- **Dado** que as telas e contratos da interface têm testes anotados
- **Quando** o roteiro da Fase 3 é consultado
- **Então** os itens implementados estão marcados, os estados de processamento
  estão enumerados e a validação visual ainda não realizada permanece pendente.

#### AC-023 — Recursos extras preservam as distinções do experimento

- **Dado** um resultado de análise ou uma demonstração didática
- **Quando** uso exportação, comparação entre modelos ou simulação de perda
- **Então** os dados publicados do estudo permanecem imutáveis e os resultados
  simulados ou locais ficam claramente identificados como tais.

Contrato de T-024 (recorte visual autorizado): o Raio-X de exemplos e uploads
oferece simulação local desativada inicialmente, com níveis 0/10/20% e semente
visual 0–4 independente dos modelos. Uma seleção pura e determinística usa
número do fluxo, metadados da amostra, semente e nível, sobre todos os até 100
pacotes guardados antes do corte visual de 32; perde `round(n × nível / 100)`
pacotes, preservando ordem e índices originais. Os totais da amostra e da
escada são distintos; amostras curtas podem arredondar para zero perdas.
Retidos/perdidos ficam legíveis na tabela e na escada, inclusive sem animação
e com `prefers-reduced-motion`. Não há mutação da entrada, persistência nem
requisição à API ao configurar a simulação. O aviso informa que matriz,
palpites, prefixos e oclusões são os originais, sem reclassificação; as barras
mantêm o prefixo original completo enquanto a perda visual é reproduzida.
Não há recálculo de características/intervalos, novos modelos, métricas de
desempenho ou macro-F1 simulado. C4 permanece separado e imutável.
Este recorte não substitui a verificação das demais entregas de AC-023.

#### AC-024 — Artefatos locais de deploy não contêm segredos

- **Dado** que o workspace contém configurações para execução containerizada
- **Quando** valido Compose, variáveis e automação de deploy
- **Então** os serviços têm configuração coerente, nenhum segredo é versionado
  e a documentação distingue configuração local de implantação real.

#### AC-025 — Dependências externas e decisões ficam rastreáveis

- **Dado** um item do roteiro que requer pcaps originais, escolha de protocolo,
  domínio, VPS ou credenciais
- **Quando** essa dependência não está disponível
- **Então** ela continua explicitamente pendente, sem ser marcada como feita
  nem substituída por dados ou ambiente inventados.

#### AC-026 — Comparação 10% × 100% é pareada e reproduzível

- **Dado** o protocolo aprovado de 10% estratificados, macro-F1, teste
  intocado e cinco sementes pareadas
- **Quando** o runner do experimento é usado com os dados processados
- **Então** ele compara as mesmas arquiteturas e hiperparâmetros em 10% e
  100%, grava os resultados fora das referências publicadas e não altera
  validação, teste ou artefatos científicos existentes.

#### AC-027 — README da raiz apresenta a aplicação e aponta para a documentação

- **Dado** uma pessoa que chega ao repositório
- **Quando** lê o `README.md` da raiz
- **Então** encontra propósito, recursos, arquitetura, início rápido, testes,
  privacidade e limitações, além de links para `docs/SISTEMA.md` e
  `docs/DESIGN.md`.

## Fora de escopo

- Alterar ou substituir as tabelas e conclusões científicas publicadas.
- Fazer deploy, alterar DNS/proxy/VPS ou acessar contas externas sem dados e
  autorização explícitos.
- Inventar capturas/datasets ou alterar validação, teste, tabelas e conclusões
  científicas para o experimento adicional com 10% de rótulos.

## Suposições

<!-- O que estamos ASSUMINDO sem confirmação. Status: aberta | confirmada | invalidada -->

| ID | Suposição | Status | Resolução |
|---|---|---|---|
| ASM-013 | Os modelos e esforços definidos pelo usuário para a execução anterior continuam valendo: Luna/baixo para trabalho comum, Sol/médio para integração e Astra/alto para interface/animação complexa. | confirmada | Instrução explícita do usuário no plano sequencial anterior. |
| ASM-014 | As configurações de deploy podem ser preparadas com nomes de secrets e valores de exemplo, sem executar implantação. | confirmada | O README descreve DNS/VPS/GitHub Actions, mas nenhuma credencial/host foi fornecida. |

## Perguntas em aberto

<!-- O que ainda não sabemos. Status: aberta | respondida -->

| ID | Pergunta | Status | Resposta |
|---|---|---|---|
| Q-002 | Para a comparação de 10% vs. 100%, qual protocolo de amostragem/estratificação, métrica principal e repetição de treino deve ser usado? | respondida | O usuário aprovou 10% estratificados do treino, macro-F1 no mesmo teste intocado, cinco sementes pareadas e arquitetura/hiperparâmetros constantes. Execução real depende da disponibilização de `dataset.npz`, `splits.npz` e `meta.csv`, ausentes do workspace atual. |
| Q-003 | Qual domínio, VPS e método de acesso devem ser usados para implantação real? | respondida | Não foram fornecidos host, credenciais ou autorização; deploy e DNS ficam fora do escopo executável desta rodada. O README registra a dependência sem afirmar implantação. |
| Q-004 | O usuário pode fornecer pcaps originais ou uma captura própria anonimizada para validar leitura de tráfego real? | respondida | Os pcaps originais não vieram no ZIP e nenhuma captura própria foi fornecida. A validação com tráfego real fica pendente até o usuário disponibilizar arquivos autorizados. |
