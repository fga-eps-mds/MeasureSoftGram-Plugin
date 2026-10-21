# Diagnóstico do MeasureSoftGram Plugin — 2026.2

| | |
|---|---|
| **Data** | 07/10/2026 |
| **Repositório** | `fga-eps-mds/2026.1-MeasureSoftGram-Plugin` (renomeado para `MeasureSoftGram-Plugin`) |
| **Commit analisado** | `77e6921` em `develop` (18/09/2026) |
| **Versão publicada** | `MeasureSoftGram.measuresoftgram` 1.0.2 no VS Code Marketplace (06/07/2026) |

## Status em 08/10/2026 (branch `001-fix-diagnostico-2026-2`, local)

Todos os itens abaixo foram tratados na branch local `001-fix-diagnostico-2026-2` (66 tarefas em `specs/001-fix-diagnostico-2026-2/tasks.md`, um commit por tarefa). Verificação: 153 testes unitários da extensão, 266 da interface, 11 testes de integração em VS Code real, lint zero nos dois pacotes, `.vsix` gerado sem `coverage/`.

| Item | Status | Onde |
|---|---|---|
| C1 dados falsos sem token | ✅ resolvido | mock removido de `msgramApi.ts`; sem token a extensão emite `not_configured` e mostra `NotConfiguredView` (T024–T028) |
| C2 URL padrão fora do ar | ✅ resolvido | `msgram.serviceUrl` em `contributes.configuration`, padrão `https://msgram.lappis.rocks` (T009, T011) |
| C3 execução local da Action | ✅ resolvido | `workflow_dispatch` no modelo, secrets por ambiente, saída transmitida por `ActRunner`, botão Parar, Docker como pré-requisito (T057–T062) |
| A1 CI vermelho | ✅ código corrigido · ⛔ secrets | `msgram.yml` usa `GITHUB_TOKEN` e só roda após testes verdes; `METRICAS_PLUGIN` e `VSCE_PAT` dependem de admin (`docs/SECRETS.md`, T040, T043) |
| A2 teste de integração nunca rodava | ✅ resolvido | glob corrigido, `test-electron` 3.1, 11 testes em VS Code real (T005, T037, T065) |
| A3 ícones ausentes | ✅ resolvido | `@tabler/icons-webfont` empacotado, CSP com `font-src` (T048, T049) |
| A4 configurações somem | ✅ resolvido | `config/settings.ts`: campos na configuração do VS Code, tokens no Secret Storage, flags para a interface (T011, T033, T035) |
| A5 sobrescrita do workflow | ✅ resolvido | `request_yaml` lê o arquivo existente e a interface mostra "arquivo existente" (T035, T036) |
| A6 status bar girando | ✅ resolvido | base é dona da status bar; painel também atualiza (T014, T016) |
| A7 empacotamento manual | ✅ resolvido | `vscode:prepublish` com build da interface, `.vscodeignore`, `package.yml` com validação do pacote (T003, T004, T041, T044) |
| M1 sem timeout | ✅ | `httpClient.ts`, `msgram.requestTimeoutMs` (T013) |
| M2 barra dupla | ✅ | `normalizeBaseUrl` (T011) |
| M3 regras fixas | ✅ | paginação, seletor de organização, metas de `current/goal/` (T024, T028) |
| M4 textos falsos | ✅ | data real da última análise, aviso sem "commit", README (T027, T029) |
| M5 Grafana sem testes | ✅ | 2% → 100% (T038) |
| M6 lint da interface | ✅ | 0 erros, roda no CI (T006, T033, T039) |
| M7 dependências | ✅ | lockfile da raiz, deps sem uso removidas, audit zerado na interface; raiz ver T064 (T001, T002, T064) |
| M8 segurança da interface | ✅ | CSP restrita, iframe `sandbox`, hosts permitidos, escape no YAML (T034, T049–T051) |
| M9 escopos | ✅ | configuração por workspace/global, tokens globais no Secret Storage (T011) |
| B1 duplicação | ✅ | lógica da Action na base (T014, T015) |
| B2 recursos sem descarte | ✅ | listeners em `subscriptions`, Output não abre sozinho (T015) |
| B3 código morto | ✅ | `login()` removida (T024) |
| B4 tema | ✅ | tokens `--msg-*` sobre `--vscode-*` (T052) |
| B5 parser.py | ✅ | timeout, `raise_for_status`, validação (T042) |
| B6 CI | ✅ | Node 22, Action fixada em 2.1.5, `checkout@v4` (T039–T041, T059) |
| B7 README | ✅ | selos, instalação, token, Docker (T029, T044, T062) |

**Não verificável sem push:** execução dos três workflows no GitHub. **Depende da equipe:** criar `METRICAS_PLUGIN` e `VSCE_PAT`; apagar a tag órfã `v.3.2.0`; abrir o Docker para testar o caminho "Executar" com daemon ativo.

---

## Resumo

- **A extensão existe.** Ela compila, os 282 testes passam e está publicada no Marketplace, com 11 instalações e 229 downloads.
- **Quem instala só vê dados inventados.** A URL padrão da API está fora do ar e o token vem vazio. Sem token, o código devolve repositórios e score falsos (0.94) e não avisa ninguém.
- **Executar a Action localmente não funciona.** O workflow gerado não dispara no `act`, os tokens não chegam até ele e a aba de saída nunca recebe nada.
- **O CI está vermelho desde 14/09.** Dois dos três workflows falham em todo push por causa de secrets inválidos ou que não existem.
- **Nenhum teste toca o VS Code real nem a API real.** O teste de integração aponta para um padrão de arquivo que não existe.

## Como o diagnóstico foi feito

- Exportei o `origin/develop` para uma pasta temporária. Rodei instalação, compilação, lint, testes com cobertura, build da interface e `npm audit` nas duas partes (extensão e interface).
- Li os logs dos workflows que falham com `gh run view --log-failed`.
- Testei com `curl`, sem credenciais, a URL padrão da API e a URL do LAPPIS.
- Baixei o `.vsix` 1.0.2 do Marketplace e listei o conteúdo. Não executei nada dele.
- Li todo o código da extensão (`src/`) e da interface (`webview-ui/src/`).

**O que passou:** instalação, `compile`, `lint` da extensão, 71 testes da extensão (93% de cobertura), 211 testes da interface (88%) e build da interface (271 KB).

**O que não foi verificado:** o fluxo com um token real (não tenho token) e a execução do `act` com Docker. Os itens que dependem disso estão marcados como **provável**.

---

## 1. "O plugin é mockado?"

**Em parte.** O código que fala com a API existe e parece correto. Mas a configuração que vem de fábrica nunca chega nele:

1. O token padrão é vazio ([measureSoftGramBase.ts#L19-L23](src/panels/measureSoftGramBase.ts#L19-L23)).
2. Sem token, `fetchRepositories` e `fetchScoreForRepo` devolvem `MOCK_REPOS` e `MOCK_SCORE` ([msgramApi.ts#L35-L47](src/services/msgramApi.ts#L35-L47), [#L168-L171](src/services/msgramApi.ts#L168-L171), [#L243-L246](src/services/msgramApi.ts#L243-L246)).
3. A interface mostra esses dados como se fossem reais. A barra de status fica verde com `MSGRAM: 0.94`. O único aviso é uma linha no painel Output ("usando score mockado").
4. Mesmo quem coloca um token continua sem dado real, porque a URL padrão `https://msgram-api.synaptha.com/` responde **404 em qualquer caminho**.
5. O `.vsix` publicado (1.0.2) tem exatamente esse comportamento: o mock, a URL `synaptha` e o texto fixo "última análise: agora mesmo".
6. Os testes não mostram o contrário: todos rodam com o `vscode` simulado e com as funções de rede trocadas por versões falsas.

---

## 2. Críticos

### C1. Dados falsos sem aviso quando não há token

- **Onde:** [msgramApi.ts#L35-L47](src/services/msgramApi.ts#L35-L47), [#L168-L171](src/services/msgramApi.ts#L168-L171), [#L243-L246](src/services/msgramApi.ts#L243-L246)
- **Efeito:**
  - Qualquer pessoa que instala vê o score 0.94 e os repositórios `mock-repo-frontend` e `mock-repo-backend`.
  - No mock, Maintainability é 0.68 e a meta é 0.75. Isso faz aparecer o aviso "Atenção antes do commit" com base em dado inventado.
- **Correção:** sem token, mostrar uma tela de "configure sua conta" com botão para Settings. Se o mock continuar existindo, ele precisa de um selo visível de "dados de exemplo".

### C2. A URL padrão da API está fora do ar

- **Onde:** [measureSoftGramBase.ts#L21](src/panels/measureSoftGramBase.ts#L21), [SettingsView.tsx#L30](webview-ui/src/components/SettingsView.tsx#L30) e [#L43](webview-ui/src/components/SettingsView.tsx#L43)
- **Evidência:**
  - `msgram-api.synaptha.com` responde `404 page not found` em `/`, `/api/v1/` e `/api/v1/organizations/`.
  - É um domínio de fora da infraestrutura do LAPPIS, introduzido no commit `6b4b01d` (25/06/2026).
- **A API real:**
  - Fica em `https://msgram.lappis.rocks`.
  - `/api/v1/` respondeu 200, e `/organizations/` e `/grafana/dashboards/` responderam 401. As rotas existem e pedem token.
  - **Ela oscila:** `.../latest-values/tsqmi/` respondeu 500 e, minutos depois, tudo passou a responder 502.
- **Correção:**
  - Trocar o padrão para `msgram.lappis.rocks`.
  - Expor a URL em `contributes.configuration` em vez de deixá-la fixa no código.
  - Combinar com o time do Service a estabilidade da API.

### C3. Executar a Action localmente não funciona

O botão "Executar" salva `.github/workflows/msgram.yml` e roda `docker compose up` com o [act](https://github.com/nektos/act) dentro de um contêiner. Isso falha por três motivos:

- **a. O workflow não dispara** (provável). O modelo padrão só dispara em `workflow_run` ([defaultWorkflow.ts#L3-L6](webview-ui/src/utils/defaultWorkflow.ts#L3-L6)). O `act` simula o evento `push` por padrão, e o [compose.yml](resources/docker/compose.yml) não informa outro evento. Assim, nenhum job deve rodar.
- **b. Os tokens não chegam até a Action.**
  - O YAML gerado usa `${{ secrets.GITHUB_TOKEN }}` e `${{ secrets.MSGRAM_TOKEN }}` ([workflowYaml.ts#L13-L18](webview-ui/src/utils/workflowYaml.ts#L13-L18)).
  - O compose roda só `act -W <arquivo>`, sem `-s` nem `--secret-file`.
  - Os tokens que a pessoa digita em Settings servem só para a checagem de "campo preenchido". A Action falharia com o mesmo erro do CI: `Input required and not supplied: githubToken`.
- **c. A aba de saída nunca recebe nada.**
  - A interface espera as mensagens `analysis_started`, `output_line`, `analysis_done` e `analysis_stopped` ([App.tsx#L93-L120](webview-ui/src/App.tsx#L93-L120)). A extensão não envia nenhuma delas, porque a execução vai para um terminal comum.
  - O README promete "log detalhado no painel Output".
- **Correção:**
  - Passar o evento e os secrets ao `act`, por exemplo com `workflow_dispatch` no modelo e `--secret-file` gerado a partir do Secret Storage.
  - Rodar com `child_process` e transmitir a saída para a interface.
  - Se nada disso entrar no escopo, remover a funcionalidade.

---

## 3. Altos

### A1. O CI falha em todo push

| Workflow | Erro | Onde |
|---|---|---|
| Export de métricas | `remote: Invalid username or token` ao enviar para `2026.2-MeasureSoftGram-DOC` | [metrics.yml#L40](.github/workflows/metrics.yml#L40) — o token no secret `METRICAS_PLUGIN` é inválido ou expirou |
| msg | `Input required and not supplied: githubToken` | [msgram.yml#L20](.github/workflows/msgram.yml#L20) — o secret `GITHUBTOKEN` não existe |
| Rodar Testes | passa | — |

**Correção:**
- Recriar o `METRICAS_PLUGIN` como um token com permissão de escrita no repo de documentação.
- Para o `msg`, usar `${{ secrets.GITHUB_TOKEN }}` ou criar o secret que falta.
- Fazer o `msg` rodar só quando os testes passarem (`if: github.event.workflow_run.conclusion == 'success'`).

### A2. O teste de integração nunca roda

- **Onde:** [.vscode-test.mjs#L4](.vscode-test.mjs#L4) procura `out/tests/**/*.tests.js`, mas os arquivos se chamam `*.test.js`. O `npm test` não encontra nenhum teste.
- **Efeito:** os 282 testes rodam com Mocha e Vitest usando o VS Code simulado e funções de rede falsas. Nada exercita o VS Code real nem a API.
- **Correção:** corrigir o padrão e criar pelo menos um teste básico que ative a extensão no `@vscode/test-electron`.

### A3. Os ícones não aparecem na extensão

- **Onde:** a interface usa 14 ícones Tabler (`<i className="ti ti-...">`). O CSS deles só é carregado pelo CDN no [webview-ui/index.html#L8](webview-ui/index.html#L8).
- **Por que somem:**
  - A extensão monta o próprio HTML ([measureSoftGramBase.ts#L139-L160](src/panels/measureSoftGramBase.ts#L139-L160)) e não usa esse `index.html`.
  - Mesmo que usasse, a política de segurança (`default-src 'none'`, sem `font-src`) bloquearia o CDN.
  - Isso foi verificado lendo o código, não na tela.
- **Correção:** instalar o `@tabler/icons-webfont`, importar em `main.tsx` e liberar `font-src ${webview.cspSource}` na política de segurança. Outra opção é trocar pelo `react-icons`, que já está nas dependências e não é usado.

### A4. Configurações somem

- **Onde:** [measureSoftGramBase.ts#L60-L74](src/panels/measureSoftGramBase.ts#L60-L74) e [#L173-L182](src/panels/measureSoftGramBase.ts#L173-L182)
- **O que acontece:**
  - A extensão só guarda a URL, o nome do produto e o token do MSGram.
  - O GitHub token, o `sonarProjectKey` e o `workflowName` são descartados. Eles ficam só no estado da interface, em texto puro.
  - Ao reabrir, a extensão devolve à interface só a URL e o produto. O botão "Executar" volta a reclamar de campos faltando até a pessoa salvar tudo de novo.
- **Agravante:** o aviso da tela de Settings diz "Tokens armazenados no Secret Storage do VSCode" ([SettingsView.tsx#L76](webview-ui/src/components/SettingsView.tsx#L76)), mas só um dos tokens vai para lá.
- **Correção:** guardar todos os campos, com os tokens no Secret Storage, e devolvê-los à interface ao reabrir. O valor dos tokens não precisa voltar, só a informação de que existem.

### A5. Salvar o workflow pode sobrescrever o arquivo do usuário

- **Onde:** ao abrir a aba Action, a interface pede o YAML existente com `request_yaml` ([App.tsx#L25](webview-ui/src/App.tsx#L25)). A extensão não responde a essa mensagem.
- **Efeito:**
  - O editor sempre mostra o modelo padrão ([App.tsx#L56](webview-ui/src/App.tsx#L56)).
  - Ao salvar, o modelo sobrescreve o `.github/workflows/msgram.yml` que a pessoa já tinha.
- **Também sem resposta:** a mensagem `show_warning` ([App.tsx#L199](webview-ui/src/App.tsx#L199)).
- **Correção:** fazer a extensão tratar `request_yaml` (ler o arquivo e responder com `yaml_loaded`) e `show_warning` (chamar `window.showWarningMessage`).

### A6. A barra de status fica girando para sempre

- **Onde:** [activator.ts](src/activator.ts) cria a barra de status em estado de carregamento. Só a barra lateral sabe atualizá-la ([measureSoftGramSidebar.ts#L82-L97](src/panels/measureSoftGramSidebar.ts#L82-L97)). O painel ([measureSoftGramPanel.ts](src/panels/measureSoftGramPanel.ts)) não sabe.
- **Efeito:** quem usa só o comando `msgram.run` (painel) vê `MSGRAM: ...` girando sem parar.
- **Correção:** passar a barra de status também para o painel, ou levar essa lógica para a classe base.

### A7. O empacotamento depende de passos manuais

- **Onde:** o `vscode:prepublish` só roda `tsc` ([package.json#L91](package.json#L91)). A interface (`webview-ui/build`) precisa ser gerada à mão. Um pacote feito sem esse passo abre com a tela em branco.
- **Histórico:**
  - A automação de release (PRs #19 e #20) foi fechada sem merge em 26/09/2026. A branch `feature/release-package-automation` continua no remoto.
  - A 1.0.2 foi publicada à mão. Ela inclui a interface (conferido), mas também leva o relatório de cobertura (`webview-ui/coverage`, cerca de 30 arquivos HTML). O motivo é que o [.vscodeignore#L20](.vscodeignore#L20) só ignora o `coverage/` da raiz.
  - A versão no `package.json` é `1.0.2`, mas a única tag é `v.3.2.0`.
- **Correção:**
  - Mudar o `vscode:prepublish` para `npm run build:webview && npm run compile`.
  - Trocar `coverage/**` por `**/coverage/**`.
  - Retomar o `package.yml` da branch de release.
  - Alinhar versão e tag no formato `vX.Y.Z`.

---

## 4. Médios

### M1. Requisições sem tempo limite
[msgramApi.ts#L49-L106](src/services/msgramApi.ts#L49-L106): `get` e `post` não têm tempo limite. Se a API travar (como no 502 de hoje), o carregamento nunca termina e não aparece erro.

### M2. Barra dupla na URL
A URL padrão termina em `/` e o código monta `${serviceUrl}/api/v1/...`, o que gera `//api/v1/...`. Nada normaliza isso. **Correção:** `serviceUrl.replace(/\/+$/, '')`.

### M3. Regras de negócio fixas no código
- Sempre usa a **primeira** organização ([msgramApi.ts#L181](src/services/msgramApi.ts#L181)).
- Ignora a paginação de organizações, produtos e repositórios.
- O produto precisa ter **exatamente** o nome configurado ([#L188](src/services/msgramApi.ts#L188)). O padrão é `measuresoftgram 2026`.
- A meta de toda característica é fixa em `0.7` ([#L274](src/services/msgramApi.ts#L274)). O README promete "metas definidas pela equipe".

### M4. Textos que não correspondem à realidade
- "última análise: agora mesmo" é texto fixo ([DashboardView.tsx#L55](webview-ui/src/components/DashboardView.tsx#L55)). Deveria usar a data da última coleta.
- O aviso "Atenção antes do commit" ([DashboardView.tsx#L80-L83](webview-ui/src/components/DashboardView.tsx#L80-L83)) não tem relação com commits. Ele aparece sempre que alguma característica fica abaixo da meta, e a mensagem que deveria escondê-lo (`analysis_done`) nunca chega.
- O README ([#L21](README.md#L21)) promete "alertas de regressão antes de cada commit", e essa funcionalidade não existe.

### M5. Grafana sem testes
`GrafanaView.tsx` tem **2,15%** de cobertura. É a funcionalidade principal da US12.

### M6. Lint da interface quebrado
`cd webview-ui && npm run lint` dá **8 erros e 3 avisos**:
- `any` explícito em `ActionView.test.tsx` e `vitest.config.ts`;
- variáveis não usadas em `App.test.tsx`;
- `setState` dentro de efeito em `SettingsView.tsx#L43`.

O CI ([test.yml](.github/workflows/test.yml)) não roda esse lint.

### M7. Dependências
- O `npm audit` da interface acha **7 vulnerabilidades: 2 críticas, 2 altas, 2 moderadas e 1 baixa**.
  - Críticas: `tinypool`, que entra pelo `vitest` 3 e só existe em desenvolvimento.
  - Altas: entre elas o `source-map-js`.
  - O `dompurify` vai junto com a extensão e tem alertas. O código chama `DOMPurify.sanitize()` sem o modo `IN_PLACE` dos alertas, então o risco real é baixo, mas `npm audit fix` resolve.
- Dependências declaradas e **não usadas**: `@vscode/webview-ui-toolkit` (também descontinuada), `react-icons` e `nanoid`.
- A raiz não tem `package-lock.json`, e o CI usa `npm install`. Cada build pode instalar versões diferentes.
- Descontinuadas na instalação: `eslint@9` e `glob@10`.

### M8. Segurança da interface
- O iframe do Grafana não tem `sandbox` ([GrafanaView.tsx#L115](webview-ui/src/components/GrafanaView.tsx#L115)).
- A política de segurança aceita `frame-src http: https:` ([measureSoftGramBase.ts#L150](src/panels/measureSoftGramBase.ts#L150)). Qualquer URL que a API devolver é carregada, inclusive por HTTP sem criptografia.
- Os valores vão para o YAML entre aspas, sem escape ([workflowYaml.ts#L20-L27](webview-ui/src/utils/workflowYaml.ts#L20-L27)). Um `"` no nome do produto quebra o arquivo.

### M9. Configurações com escopos diferentes
A URL e o produto ficam salvos por workspace (`workspaceState`), mas o token é global (`secrets`) ([measureSoftGramBase.ts#L54-L56](src/panels/measureSoftGramBase.ts#L54-L56)). Ao abrir outro projeto, o token continua lá e a URL volta para o padrão, que está fora do ar.

---

## 5. Baixos

- **B1. Código duplicado.** `_saveWorkflowFile`, `_runAction` e as dependências desses métodos são iguais em [measureSoftGramPanel.ts#L104-L141](src/panels/measureSoftGramPanel.ts#L104-L141) e [measureSoftGramSidebar.ts#L122-L159](src/panels/measureSoftGramSidebar.ts#L122-L159). Deveriam ficar na classe base.
- **B2. Recursos sem descarte.**
  - A barra lateral registra o listener de mensagens sem guardar o descarte ([#L162](src/panels/measureSoftGramSidebar.ts#L162)).
  - O painel Output abre sozinho a cada carregamento ([#L83](src/panels/measureSoftGramSidebar.ts#L83)).
- **B3. Código morto.** `login()` é exportada e nunca usada ([msgramApi.ts#L112](src/services/msgramApi.ts#L112)).
- **B4. Tema.** A interface usa cores claras fixas (`index.css`) e ignora o tema escuro do VS Code.
- **B5. parser.py.** Não trata erro nem tem tempo limite ([parser.py#L30-L33](parser.py#L30-L33)). Se o SonarCloud responder com erro, o JSON do erro é salvo como se fossem métricas.
- **B6. Detalhes do CI.**
  - As actions rodam em Node 20, que está descontinuado.
  - A `MeasureSoftGram-Action` está fixada em `@develop` ([msgram.yml#L18](.github/workflows/msgram.yml#L18)), uma referência que muda sozinha.
  - O modelo de workflow do plugin usa `actions/checkout@v3`.
- **B7. README.**
  - O selo do Marketplace leva para a página geral, não para a da extensão.
  - O selo "Site Oficial" leva para o GitHub do Service.
  - O texto "crie sua conta em no MeasureSoftGram" tem erro de digitação e não explica qual URL usar nem como obter o token.
  - Não avisa que, sem token, a extensão mostra dados de exemplo.

---

## 6. Estado do repositório

| Item | Situação |
|---|---|
| `develop` | `77e6921` (18/09/2026). Último push no remoto em 27/09. |
| `main` | 1 commit atrás de `develop`. |
| PRs abertas | nenhuma |
| PRs fechadas sem merge | #19 e #20 (automação de release, 26/09) |
| Issues abertas | nenhuma |
| CI | Rodar Testes ✅ · Export de métricas ❌ · msg ❌ |
| Marketplace | 1.0.2, 11 instalações, 229 downloads. Não está no Open VSX. |
| Commits por autor (todas as branches) | João Antonio G. Carvalho 87 · i-JSS 28 · Anacleto 22 · nateejpg 7 · outros 4 |

---

## 7. Ordem sugerida de correção

1. **C2 + C1:** trocar a URL padrão e substituir o mock por uma tela de "não configurado". É o que mais muda a percepção de "plugin falso".
2. **A1:** consertar os secrets. Precisa de alguém com acesso de administrador à organização.
3. **A5 + A4:** responder a `request_yaml` e `show_warning` e guardar todos os campos de Settings.
4. **A3:** colocar os ícones dentro do pacote.
5. **A6 + M1 + M2:** barra de status no painel, tempo limite nas requisições e normalização da URL.
6. **C3:** decidir se a execução local continua. Se continuar, passar evento e secrets ao `act` e transmitir a saída para a interface. Se não, remover a aba.
7. **A2 + M5:** corrigir o padrão do teste de integração, criar um teste básico em VS Code real e cobrir o Grafana.
8. **A7:** automação de release com build da interface e `.vscodeignore` corrigido.
9. **M6–M9 e Baixos.**

---

## Apêndice — como reproduzir

```bash
npm run install:all && npm run compile && npm run lint && npm run test:coverage
```

```bash
cd webview-ui && npm run test:coverage && npm run build && npm run lint && npm audit
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://msgram-api.synaptha.com/api/v1/organizations/
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://msgram.lappis.rocks/api/v1/organizations/
```

```bash
gh run list -R fga-eps-mds/MeasureSoftGram-Plugin --limit 10
```
