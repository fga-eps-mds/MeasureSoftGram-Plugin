# Secrets que o CI precisa

Os workflows em `.github/workflows/` dependem dos secrets abaixo. Eles ficam em
**Settings → Secrets and variables → Actions** do repositório (ou da organização
`fga-eps-mds`). Só quem tem papel de **admin** consegue criar ou trocar.

| Secret | Usado por | Para quê | Quem cria | Como validar |
|---|---|---|---|---|
| `GITHUB_TOKEN` | `msgram.yml`, `metrics.yml`, `release.yml`, `sonar.yml` | token automático do próprio workflow | ninguém (o GitHub fornece) | nada a fazer |
| `SONAR_TOKEN` | `test.yml` | enviar análise ao SonarCloud (`fga-eps-mds-1`) | admin do SonarCloud | o passo "Scanner do SonarCloud" termina verde |
| `MSGRAMPLUGINTOKEN` | `msgram.yml` | token de API do MeasureSoftGram para publicar métricas deste repo | quem tem conta no produto "Measure" em `msgram.lappis.rocks` | o job `msg` termina verde e o produto recebe uma coleta nova |
| `VSCE_PAT` | `release.yml` | publicar o `.vsix` no VS Code Marketplace como `MeasureSoftGram` | quem administra o publisher no [Marketplace](https://marketplace.visualstudio.com/manage) (Azure DevOps PAT com escopo *Marketplace: Manage*) | ao mesclar o PR de release do Release Please na `main`, o passo "Publicar no Visual Studio Marketplace" roda |

## Estado em 07/10/2026 (diagnóstico)

- `METRICAS_PLUGIN`, `USER_EMAIL`, `USER_NAME`: **não são mais usados**. O workflow "Export de métricas" falhava em todo push desde 14/09 com `remote: Invalid username or token` ao tentar dar push no repositório DOC. Esse passo foi removido: os JSON do SonarCloud ficam como artefato do workflow (90 dias) em todo push e como asset da release quando há tag. Os três secrets podem ser apagados.
- `GITHUBTOKEN` (sem underscore): **não existia**. O workflow `msg` passou a usar `GITHUB_TOKEN`, então esse secret não é mais necessário.
- `VSCE_PAT`: **não existe**. Sem ele o `release.yml` gera e anexa o `.vsix` à release, mas pula a publicação com um aviso.

## Como criar o `VSCE_PAT`

1. Entre em <https://dev.azure.com> com a conta Microsoft que é membro do publisher `MeasureSoftGram`.
2. Ícone do usuário → **Personal access tokens** → **New Token**.
3. Organization: **All accessible organizations**; Scopes: **Custom defined** → **Show all scopes** → **Marketplace → Manage**.
4. Confira antes de guardar: `npx --yes @vscode/vsce login MeasureSoftGram` (cole o token; deve responder "verification succeeded").
5. Repositório do plugin → **Settings → Secrets and variables → Actions** → `VSCE_PAT`.
6. Validação: o próximo PR de release mesclado na `main` publica; o log do passo "Publicar no Visual Studio Marketplace" confirma.

**Prazo**: a Microsoft aposenta os PATs globais do Azure DevOps em **1º/12/2026**. Depois disso a
publicação precisa de Microsoft Entra ID com identidade gerenciada (`vsce publish --azure-credential`),
que exige uma assinatura Azure. Pendência da equipe para o próximo semestre.

## Rotação

Tokens pessoais expiram. Ao renovar, troque o valor do secret e dispare o workflow
correspondente manualmente (`workflow_dispatch`) para confirmar.
