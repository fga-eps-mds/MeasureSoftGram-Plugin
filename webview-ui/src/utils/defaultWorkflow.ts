/**
 * Modelo do .github/workflows/msgram.yml gerado pela extensão.
 *
 * - workflow_run: execução oficial no GitHub, após o workflow de build.
 * - workflow_dispatch: execução local pelo botão "Executar" (o act dispara
 *   esse evento) e execução manual pela aba Actions.
 *
 * Os cinco inputs configuráveis são preenchidos por applySettingsToYaml a
 * partir das Settings; os tokens ficam sempre como referências a secrets.
 */
export const DEFAULT_WORKFLOW_YAML = `name: MeasureSoftGram
on:
  workflow_dispatch:
  workflow_run:
    workflows: ["Build"]
    types:
      - completed
jobs:
  msgram_job:
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Action MeasureSoftGram
        uses: fga-eps-mds/MeasureSoftGram-Action@2.1.5
        id: msgram
        with:
          githubToken: \${{ secrets.GITHUB_TOKEN }}
          msgramServiceToken: \${{ secrets.MSGRAM_TOKEN }} # Crie o secret MSGRAM_TOKEN no repositório
          sonarProjectKey: "" # Chave do projeto no SonarCloud (opcional)
          productName: "" # Nome do produto cadastrado no MeasureSoftGram
          workflowName: "Build" # Nome do workflow que realiza a build da release
          collectSonarqubeMetrics: true # Flag que determina se métricas do Sonarqube serão persistidas
          collectGithubMetrics: true # Flag que determina se métricas do Github serão persistidas
          usLabel: "US"
`;
