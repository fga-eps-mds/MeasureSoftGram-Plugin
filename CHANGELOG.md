# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versões seguem SemVer e coincidem com a tag git `vX.Y.Z`.

## [1.1.0] - 2026-10-08

Correção de todos os itens do diagnóstico de 07/10/2026 (`diagnostico-2026-2.md`).

### Dados reais ou estado "não configurado"
- Removidos os dados de exemplo (`mock-repo-*`, score 0.94). Sem token a extensão mostra a tela "Extensão não está configurada" com o que falta e botões para Settings e `settings.json`; a barra de status fica em `MSGRAM: configurar`.
- URL padrão do serviço passa a ser `https://msgram.lappis.rocks`, declarada em `contributes.configuration` (`msgram.serviceUrl`) junto com `productName`, `organizationName`, `sonarProjectKey`, `workflowName`, `requestTimeoutMs` e `grafanaAllowedHosts`.
- Metas por característica vêm de `current/goal/` do serviço; sem meta o painel diz "sem meta definida".
- "Última análise" mostra a data real da coleta (relativa, com a absoluta no tooltip) em vez de "agora mesmo".
- O aviso de regressão passa a "Atenção: característica abaixo da meta" e só aparece quando há meta e alguma característica está abaixo.
- Paginação completa de organizações, produtos e repositórios; seletor de organização quando a conta tem mais de uma.
- Tempo limite por requisição (padrão 15 s, configurável) e erros classificados (token inválido, serviço indisponível, tempo esgotado, não encontrado) com botão "Tentar de novo".

### Configurações
- Todos os campos de Settings persistem: os não sensíveis na configuração do VS Code (workspace quando há pasta aberta), os tokens MSGram e GitHub no Secret Storage. A interface recebe só a informação de que o token existe.
- Campo "Organization" opcional. Botão "remover" para cada token.
- A aba Action carrega o `msgram.yml` existente do projeto e indica "arquivo existente" ou "novo arquivo"; o modelo não sobrescreve mais o arquivo da pessoa sem ela ver.
- Valores com aspas ou barras invertidas são escapados no YAML.
- Avisos da interface aparecem como notificações do VS Code.

### Execução local da Action
- O modelo de workflow aceita `workflow_dispatch` (o `act` dispara esse evento), usa `actions/checkout@v4` e `MeasureSoftGram-Action@2.1.5`, e só roda após build com sucesso ou por dispatch.
- "Executar" verifica o Docker antes (ausente ou parado → aviso com link de instalação), passa os tokens ao contêiner só pelo ambiente do processo, transmite a saída em tempo real para a aba Saída com os tokens mascarados, e "Parar" interrompe e derruba o contêiner. Uma execução por vez.
- Docker documentado como pré-requisito no README.

### Interface
- Barra lateral nativa ("Qualidade"): árvore do VS Code com ícones do editor, produto/organização, repositório (troca por Quick Pick), TSQMI e meta, última análise, características, dashboards do Grafana e ações; tela de boas-vindas nativa quando falta configuração; botões no título da view. O painel React vira a view "Painel" e o detalhe aberto pela árvore.
- Cadastro com um clique: quando a pasta aberta não está em nenhum produto, a árvore e o painel oferecem "Cadastrar automaticamente" (comando `MeasureSoftGram: Cadastrar este repositório`), que escolhe organização e produto (ou cria um novo), cria o repositório pela API e já configura o workspace. A primeira coleta roda no serviço em segundo plano.
- Ao abrir a extensão em qualquer repositório cadastrado, ela entra nele sozinha: procura o repositório da pasta aberta (remote origin ou nome da pasta) no produto configurado e, se não estiver lá, em todas as organizações e produtos da conta, trocando e persistindo produto/organização. Organização escolhida por id.
- Painel principal redesenhado: medidor circular do TSQMI colorido pelo status, etiquetas de produto/repositório/última análise, características com barra de progresso e marcador da meta.
- Painel com visual nativo: ícones do próprio VS Code (codicons, empacotados, sem CDN), tipografia do editor, abas no estilo do painel, botões e inputs com as cores nativas, cartões planos.
- Política de segurança da webview restrita: `default-src 'none'`, fontes e estilos do pacote, scripts por nonce, frames só por HTTPS.
- Iframe do Grafana com `sandbox` e sem referrer; dashboards só por HTTPS e, se configurado, só de hosts permitidos.
- Tema claro e escuro do VS Code respeitado via variáveis `--vscode-*`.
- A barra de status é atualizada também quando só o painel está aberto.

### Manutenção
- `package-lock.json` da raiz versionado; CI com Node 22 e `npm ci`.
- Lint da interface com zero erros e no CI; `vitest` 5, `@testing-library/jest-dom` 7, `mocha` 12, `@vscode/test-electron` 3.1.
- Teste de integração em VS Code real (`npm run test:integration`): ativação, comandos, configuração e os fluxos de dados, settings e execução local.
- Cobertura do `GrafanaView` de 2% para 100%.
- `vscode:prepublish` gera a interface; `.vscodeignore` exclui `coverage/` de qualquer pasta; `npm run package` gera o `.vsix`.
- Workflow `msg` usa `GITHUB_TOKEN`, fixa a Action em 2.1.5 e só roda após testes verdes. Release pelo `release.yml` (Release Please, vindo do repositório 2026.2) com lint, testes e validação do conteúdo do pacote antes de anexar à release e publicar no Marketplace com `VSCE_PAT`.
- `docs/SECRETS.md` lista os secrets que o CI precisa e quem os cria.
- Workflow "Export de métricas" não faz mais push no repositório DOC (passo que falhava desde 14/09 por token inválido): os JSON do SonarCloud ficam como artefato do workflow em todo push e como asset da release nas tags. Os secrets `METRICAS_PLUGIN`, `USER_EMAIL` e `USER_NAME` deixam de ser necessários.
- `parser.py` com timeout, `raise_for_status` e validação da resposta.
- Lógica da aba Action centralizada na classe base; listeners registrados em `subscriptions`; `login()` e dependências sem uso removidos.

### Removido
- Dados de exemplo em produção, execução via terminal integrado, URL `msgram-api.synaptha.com`, promessa de "alertas antes de cada commit".

## [1.0.2] - 2026-07-06

Versão publicada no Marketplace antes do diagnóstico.
