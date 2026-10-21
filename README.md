<div align="center">

# MeasureSoftGram

**Análise multidimensional da qualidade de software, direto no VS Code.**

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--v3-orange.svg)](https://www.gnu.org/licenses/agpl-3.0)
&nbsp;
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue.svg)](https://marketplace.visualstudio.com/items?itemName=MeasureSoftGram.measuresoftgram)
&nbsp;
[![Site Oficial](https://img.shields.io/badge/Site-MeasureSoftGram-green.svg)](https://msgram.lappis.rocks/)

[Instalar Extensão](#instalação) · [Site Oficial](https://fga-eps-mds.github.io/MeasureSoftGram-Docs/) · [Reportar Bug](https://github.com/fga-eps-mds/MeasureSoftGram-Plugin/issues) · [Documentação](https://github.com/fga-eps-mds/MeasureSoftGram-Plugin)

</div>

---

## Visão geral

O painel exibe o indicador multidimensional da qualidade de software **TSQMI**, as características de qualidade com valores e metas definidas pela equipe no MeasureSoftGram, a data da última análise, e avisa quando alguma característica fica abaixo da meta.

![Painel principal do plugin mostrando score 0.86 e características Reliability, Maintainability e Functional Suitability](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/painel-principal.png)
---

## O que o plugin faz

- **Indicador Multidimensional da Qualidade Geral/Total do Software (TSQMI)** - um único número de 0 a 1 que resume a saúde do projeto, calculado por um metamodelo algébrico original (produto de Hadamard + norma de Frobenius).
- **Características de qualidade** - Confiabilidade, Manutenibilidade e Adequação Funcional, cada uma com valor atual e a meta definida pela equipe no serviço.
- **Dashboards Grafana embutidos** - quatro painéis analíticos carregados diretamente dentro do VS Code, sem abrir o browser.
- **Visibilidade de log** - todas as chamadas à API ficam no canal "MeasureSoftGram API" do painel Output do VS Code, e a saída da execução local aparece na aba **Saída** do painel.
- **MeasureSoftGram Action** - gera o `.github/workflows/msgram.yml` do seu projeto a partir das Settings e, se você tiver Docker, executa a Action localmente para testar.

### Execução local da Action (requer Docker)

A aba **Action** edita e salva o `msgram.yml`. A execução oficial continua sendo no GitHub Actions, após o workflow de build. O botão **Executar** roda o mesmo workflow na sua máquina com o [act](https://github.com/nektos/act) dentro de um contêiner:

- **Pré-requisito:** [Docker](https://docs.docker.com/get-docker/) instalado e em execução. Sem ele o botão avisa e não roda nada.
- Os tokens configurados em Settings são passados ao contêiner só pelo ambiente do processo e aparecem mascarados na saída.
- A saída chega em tempo real na aba **Saída**; **Parar** interrompe e derruba o contêiner.
- A execução local também publica no MeasureSoftGram, então precisa de internet e dos dois tokens.


---

## Instalação

1. Instale a extensão pelo [Marketplace](https://marketplace.visualstudio.com/items?itemName=MeasureSoftGram.measuresoftgram).
2. Crie sua conta no [MeasureSoftGram](https://msgram.lappis.rocks/) e gere um **token de API** no seu perfil. Cadastre (ou peça acesso a) o **produto** que você quer acompanhar.
3. Clique no ícone **MeasureSoftGram** na Activity Bar, ou use `Ctrl+Shift+P` → `MeasureSoftGram: Abrir MeasureSoftGram (Panel)`.
4. Na aba **Config**, informe:
   - **MSGRAM Service URL**: já vem preenchida com `https://msgram.lappis.rocks`. Só mude se usar outra instância.
   - **MSGRAM Service Token**: o token gerado no passo 2. Ele fica guardado no Secret Storage do VS Code.
   - **Product Name**: o nome exato do produto cadastrado no serviço.
5. Clique em **Salvar**. O painel carrega os dados reais do produto.

> **Sem token a extensão não mostra nenhum dado.** Em vez de um score, você vê a tela "Extensão não está configurada" com o que falta preencher. A URL e o nome do produto também podem ser editados em `settings.json` (`msgram.serviceUrl`, `msgram.productName`).

---

## Dashboards Grafana integrados

A aba **Grafana** carrega os dashboards diretamente no VS Code, já filtrados pelo produto e repositório selecionados. São quatro painéis cobrindo aspectos complementares da qualidade.

### Lista de dashboards

![Aba Grafana mostrando a lista de 4 dashboards disponíveis](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/grafana-lista-dashboards.png)

---

### Dashboard 1 - Visão Geral de Qualidade

Visão consolidada do produto: contadores de repositórios, arquivos, características e métricas coletadas; gauges de TSQMI por repositório; gráfico **Planejado vs Realizado** por característica; e radar comparando as características entre os repositórios.

![Dashboard Visão Geral de Qualidade com gauges de TSQMI, gráfico Planejado vs Realizado e radar de características](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/grafana-visao-geral.png)

---

### Dashboard 2 - Pulso de Qualidade (ECG)

Evolução do TSQMI ao longo do tempo no formato de "batimento cardíaco" - uma linha por repositório. Ideal para identificar instabilidades e períodos de queda na qualidade.

![Dashboard de Pulso mostrando evolução do TSQMI em formato ECG para CLI (0.859), Core (0.165) e Front (0.479)](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/grafana-dashboard-pulso.png)

---

### Dashboard 3 - Hierarquia Completa de Qualidade

Evolução temporal em quatro camadas: **Características → Subcaracterísticas → Medidas → Métricas Coletadas**. Filtrável por repositório e característica.

**Características e subcaracterísticas:**

![Evolução temporal de Functional Suitability e subcaracterísticas para o repositório CLI](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/grafana-evolucao-temporal-1.png)

**Medidas e métricas coletadas:**

![Evolução temporal das medidas e métricas coletadas com tooltip mostrando Team Throughput 0.708](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/grafana-evolucao-temporal-2.png)

---

### Dashboard 4 - Saúde por Repositório

Evolução de cada característica individualmente como série temporal, com marcadores de release (v2025.1.0, v2025.2.0, v2025.3.0). Permite avaliar o impacto de cada versão sobre Confiabilidade, Manutenibilidade e Adequação Funcional.

![Dashboard Saúde de Qualidade por Repositório mostrando Confiabilidade, Manutenibilidade e Ad. Funcional com marcadores de release](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/grafana-saude-qualidade.png)

---

### Action MeasureSoftGram

Executa a action que publica a qualidade de software direto no MeasureSoftGram, com log detalhado no painel Output do VS Code.

![Execução da Action](https://raw.githubusercontent.com/fga-eps-mds/MeasureSoftGram-Plugin/refs/heads/develop/assets/action.png)

---

## Desenvolvimento e release

```bash
npm ci && (cd webview-ui && npm ci)   # dependências fixadas pelos lockfiles
npm run lint && npm run lint:webview  # zero erros nos dois pacotes
npm run test:unit                     # extensão, com o 'vscode' simulado
npm run test:integration              # abre um VS Code real e ativa a extensão
npm run build:webview && npm run compile
npm run package                       # gera measuresoftgram-<versão>.vsix
```

O `.vsix` sai com a interface compilada e sem relatórios de cobertura. A publicação é automática, pelo workflow **Release & Marketplace** com o [Release Please](https://github.com/googleapis/release-please):

1. Commits convencionais (`feat:`, `fix:`, ...) chegam à `main`. O Release Please abre (ou atualiza) um PR de release com a nova versão e o `CHANGELOG.md`.
2. Ao mesclar esse PR, o workflow cria a tag e a release no GitHub, roda lint e testes, empacota, confere o conteúdo do `.vsix`, anexa à release e publica no Marketplace (se o secret `VSCE_PAT` existir).

Os secrets que o CI precisa estão descritos em [docs/SECRETS.md](docs/SECRETS.md).

---

## Sobre o modelo de qualidade

Trata-se de um modelo hierárquico, multinível, multivariado e multidimensional. O MeasureSoftGram usa um metamodelo algébrico (original), que representa a qualidade de produto de software no espaço R_N. Utiliza a combinação do [produto de Hadamard](https://en.wikipedia.org/wiki/Hadamard_product_(matrices)) com [norma de Frobenius](https://en.wikipedia.org/wiki/Matrix_norm#Frobenius_norm), para agregar métricas e medidas em indicadores multidimensionais de qualidade. O resultado é um indicador multidimensional, contínuo, rastreável ao longo do tempo e que expressa a percepção quantitativa da qualidade de software.

---

<div align="center">

[Site Oficial](https://fga-eps-mds.github.io/MeasureSoftGram-Docs/) · [Reportar Bug](https://github.com/fga-eps-mds/MeasureSoftGram-Plugin/issues) · [Docs](https://github.com/fga-eps-mds/MeasureSoftGram-Plugin) · Licença AGPL v3

</div>