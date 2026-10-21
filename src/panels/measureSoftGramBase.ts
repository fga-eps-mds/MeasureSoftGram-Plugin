import {Disposable, Event, EventEmitter, ExtensionContext, Uri, Webview, window, workspace} from 'vscode';
import * as defaultFs from 'fs/promises';
import * as path from 'path';
import {getNonce, getUri} from '../utilities/utilities';
import {getOutputChannel} from '../utilities/log';
import {
    fetchGrafanaDashboard as defaultFetchGrafanaDashboard,
    fetchGrafanaDashboards as defaultFetchGrafanaDashboards,
    fetchRepositories as defaultFetchRepositories,
    fetchScoreForRepo as defaultFetchScoreForRepo,
    RepoContext,
    RepoItem,
} from '../services/msgramApi';
import {HttpError} from '../services/httpClient';
import {ActRunner, sharedActRunner} from '../services/actRunner';
import {detectWorkspaceHints, WorkspaceHints} from '../utilities/workspaceRepo';
import {resolveRepoContext} from '../services/repoResolver';
import {discoverRepository as defaultDiscoverRepository} from '../services/msgramApi';
import {
    clearSecret,
    FullSettings,
    isConfigured,
    loadSettings,
    loadSettingsForUi,
    makeSettingsDeps,
    saveSettings,
    SettingsDeps,
    updateProjectSettings,
} from '../config/settings';
import type {ExtensionMessage, PanelMessage, ScoreErrorKind, SecretKey, SettingsPayload} from './messages';
import type {MsgramStatusBar} from '../statusbar/msgramStatusBar';

export type FetchRepositoriesFn = typeof defaultFetchRepositories;
export type FetchScoreForRepoFn = typeof defaultFetchScoreForRepo;

export const WORKFLOW_REL_PATH = '.github/workflows/msgram.yml';

export type LoadState = 'not_configured' | 'loading' | 'ready' | 'error';
export type ActionRunState = 'idle' | 'checking_docker' | 'running' | 'stopping';

/** Dependências de filesystem/VS Code usadas pela aba Action, injetáveis nos testes. */
export interface ActionDeps {
    workspace: { workspaceFolders: typeof workspace.workspaceFolders };
    fs: {
        mkdir: typeof defaultFs.mkdir;
        writeFile: typeof defaultFs.writeFile;
        readFile?: typeof defaultFs.readFile;
    };
    window: {
        createTerminal: typeof window.createTerminal;
        showErrorMessage: typeof window.showErrorMessage;
        showWarningMessage?: typeof window.showWarningMessage;
    };
}

function defaultActionDeps(): ActionDeps {
    return {
        workspace,
        fs: {mkdir: defaultFs.mkdir, writeFile: defaultFs.writeFile, readFile: defaultFs.readFile},
        window: {
            createTerminal: window.createTerminal.bind(window),
            showErrorMessage: window.showErrorMessage.bind(window),
            showWarningMessage: window.showWarningMessage?.bind(window),
        },
    };
}

/**
 * Classe base de painel e barra lateral.
 *
 * É a única dona de: configurações carregadas, contexto de repositórios,
 * repositório selecionado, estado de carregamento, estado da execução
 * local e da barra de status. As subclasses só expõem o `Webview`.
 */
export abstract class MeasureSoftGramBase {
    protected _settings: FullSettings | null = null;
    protected _context: RepoContext | null = null;
    protected _selectedRepo: RepoItem | null = null;
    protected _loadState: LoadState = 'not_configured';
    protected _actionState: ActionRunState = 'idle';
    /** Organização escolhida pela pessoa nesta sessão, por id (sobrepõe msgram.organizationName). */
    protected _orgPkOverride: number | null = null;
    protected readonly _settingsDeps: SettingsDeps;
    protected readonly _disposables: Disposable[] = [];
    private readonly _onDidPost = new EventEmitter<ExtensionMessage>();
    /** Toda mensagem enviada à interface; usado pelo teste de integração. */
    public readonly onDidPost: Event<ExtensionMessage> = this._onDidPost.event;
    /** Injetáveis nos testes. */
    protected _fetchGrafanaDashboards = defaultFetchGrafanaDashboards;
    protected _fetchGrafanaDashboard = defaultFetchGrafanaDashboard;
    /** Compartilhado entre painel e barra lateral: uma execução por janela. */
    protected _actRunner: ActRunner = sharedActRunner();
    /** Injetável nos testes: descoberta do repositório em toda a conta. */
    protected _discoverRepository = defaultDiscoverRepository;
    /** Injetável nos testes: pistas da pasta aberta (remote origin / nome). */
    protected _detectWorkspaceHints: () => Promise<WorkspaceHints> = async () => {
        const folder = workspace.workspaceFolders?.[0];
        return folder ? detectWorkspaceHints(folder.uri.fsPath) : {};
    };

    protected constructor(
        protected readonly _extensionContext: ExtensionContext,
        protected readonly _statusBar?: MsgramStatusBar,
        settingsDeps?: SettingsDeps,
    ) {
        this._settingsDeps = settingsDeps ?? makeSettingsDeps(_extensionContext);
    }

    protected abstract get _webview(): Webview | undefined;

    // ── Acesso para subclasses/testes ──────────────────────────────────────

    public get loadState(): LoadState {
        return this._loadState;
    }

    public get actionState(): ActionRunState {
        return this._actionState;
    }

    public get hasWebview(): boolean {
        return this._webview !== undefined;
    }

    /** Pede à interface que mostre uma aba (usado pela árvore nativa). */
    public showTab(tab: 'dashboard' | 'output' | 'settings' | 'action' | 'grafana', dashboardUid?: string): void {
        this.post({command: 'show_tab', tab, dashboardUid});
    }

    public dispose(): void {
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._onDidPost.dispose();
    }

    // ── Hooks (subclasses podem estender; a base já cuida da status bar) ───

    protected onLoadStart(): void {
        this._loadState = 'loading';
        this._statusBar?.setLoading();
    }

    protected onScoreLoaded(data: { score: number; noData?: boolean }): void {
        this._loadState = 'ready';
        if (data.noData) {
            this._statusBar?.setNoData();
        } else {
            this._statusBar?.setScore(data.score);
        }
    }

    protected onScoreError(): void {
        this._loadState = 'error';
        this._statusBar?.setError();
    }

    protected onReposEmpty(): void {
        this._loadState = 'error';
        this._statusBar?.setError();
    }

    protected onNotConfigured(): void {
        this._loadState = 'not_configured';
        this._statusBar?.setNotConfigured();
    }

    protected logger(): (msg: string) => void {
        return (msg: string) => getOutputChannel().appendLine(msg);
    }

    protected post(message: ExtensionMessage): void {
        this._webview?.postMessage(message);
        this._onDidPost.fire(message);
    }

    // ── Configurações ──────────────────────────────────────────────────────

    protected async _loadPersistedSettings(): Promise<FullSettings> {
        this._settings = await loadSettings(this._settingsDeps);
        return this._settings;
    }

    protected async _persistSettings(data: SettingsPayload): Promise<void> {
        await saveSettings(data, this._settingsDeps);
        this._settings = await loadSettings(this._settingsDeps);
    }

    protected async _postSettingsLoaded(): Promise<void> {
        this.post({command: 'settings_loaded', data: await loadSettingsForUi(this._settingsDeps)});
    }

    protected async _requireSettings(): Promise<FullSettings> {
        const settings = this._settings ?? (await this._loadPersistedSettings());
        return this._orgPkOverride !== null ? {...settings, organizationPk: this._orgPkOverride} : settings;
    }

    /**
     * Recarrega as configurações, avisa a interface e, se faltar algo,
     * emite not_configured. Devolve true quando está tudo configurado.
     */
    protected async _refreshSettingsAndGate(): Promise<boolean> {
        const settings = await this._loadPersistedSettings();
        await this._postSettingsLoaded();
        const missing = isConfigured(settings);
        const onlyProduct = missing.length === 1 && missing[0] === 'productName';
        if (missing.length && !onlyProduct) {
            this._context = null;
            this._selectedRepo = null;
            this.onNotConfigured();
            this.post({command: 'not_configured', missing});
            return false;
        }
        return true;
    }

    // ── Carregamento de dados ──────────────────────────────────────────────

    protected _errorKind(err: unknown): ScoreErrorKind {
        return err instanceof HttpError ? err.kind : 'other';
    }

    protected _errorMessage(err: unknown, fallback: string): string {
        return err instanceof Error && err.message ? err.message : fallback;
    }

    protected async _loadReposAndScore(
        fetchRepos: FetchRepositoriesFn = defaultFetchRepositories,
        fetchScore: FetchScoreForRepoFn = defaultFetchScoreForRepo,
    ): Promise<void> {
        const webview = this._webview;
        if (!webview) {
            return;
        }

        this.onLoadStart();
        this.post({command: 'score_loading'});

        try {
            const settings = await this._requireSettings();
            const hints = await this._detectWorkspaceHints();
            const result = await resolveRepoContext(settings, hints, this._selectedRepo?.id ?? null, {
                fetchRepositories: fetchRepos,
                discoverRepository: this._discoverRepository,
                persist: async (patch) => {
                    await updateProjectSettings(patch, this._settingsDeps);
                    this._orgPkOverride = null;
                    await this._loadPersistedSettings();
                    await this._postSettingsLoaded();
                },
                log: this.logger(),
            });

            if (result.kind === 'missingProduct') {
                this._context = null;
                this._selectedRepo = null;
                this.onNotConfigured();
                const unregisteredRepo = hints.remoteName ?? hints.folderName;
                if (unregisteredRepo) {
                    this.logger()(`[${new Date().toLocaleTimeString('pt-BR')}] → "${unregisteredRepo}" não está cadastrado em nenhum produto desta conta.`);
                }
                this.post({command: 'not_configured', missing: ['productName'], unregisteredRepo});
                return;
            }
            this._context = result.context;
            this.post({
                command: 'orgs_loaded',
                organizations: this._context.organizations ?? [],
                selectedOrgPk: this._context.orgPk,
            });
            if (result.kind === 'empty') {
                this._selectedRepo = null;
                this.post({command: 'repos_loaded', repos: []});
                this.onReposEmpty();
                this.post({command: 'score_error', message: 'Nenhum repositório encontrado.', kind: 'not_found'});
                return;
            }
            if (result.switched) {
                this.logger()(`[${new Date().toLocaleTimeString('pt-BR')}] → Produto trocado para "${result.switched.productName}" (${result.switched.orgName}) por causa da pasta aberta.`);
            } else if (result.detected) {
                this.logger()(`[${new Date().toLocaleTimeString('pt-BR')}] → Repositório da pasta aberta: "${result.selectedRepo.name}"`);
            }
            this._selectedRepo = result.selectedRepo;
            this.post({command: 'repos_loaded', repos: this._context.repos, selectedRepoPk: result.selectedRepo.id, detected: result.detected});
            await this._loadScoreForSelected(fetchScore);
        } catch (err) {
            const message = this._errorMessage(err, 'Erro ao buscar repositórios.');
            this.logger()(`[ERRO] ${message}`);
            this.onScoreError();
            this.post({command: 'score_error', message, kind: this._errorKind(err)});
        }
    }

    protected async _loadScoreForSelected(
        fetchScore: FetchScoreForRepoFn = defaultFetchScoreForRepo,
    ): Promise<void> {
        const webview = this._webview;
        if (!webview || !this._context || !this._selectedRepo) {
            return;
        }

        this.onLoadStart();
        this.post({command: 'score_loading'});

        try {
            const settings = await this._requireSettings();
            const data = await fetchScore(
                settings,
                this._context.orgPk,
                this._context.productPk,
                this._selectedRepo.id,
                this._selectedRepo.name,
                this.logger(),
            );
            this.onScoreLoaded(data);
            this.post({command: 'score_loaded', data: data as any});
        } catch (err) {
            const message = this._errorMessage(err, 'Erro ao buscar métricas.');
            this.logger()(`[ERRO] ${message}`);
            this.onScoreError();
            this.post({command: 'score_error', message, kind: this._errorKind(err)});
        }
    }

    // ── HTML da webview ────────────────────────────────────────────────────

    protected _getWebviewContent(webview: Webview, extensionUri: Uri): string {
        const stylesUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'index.css']);
        const scriptUri = getUri(webview, extensionUri, ['webview-ui', 'build', 'assets', 'index.js']);
        const nonce = getNonce();

        return /*html*/ `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:; frame-src https:;">
          <link rel="stylesheet" type="text/css" href="${stylesUri}">
          <title>MeasureSoftGram</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>
    `;
    }

    protected _webviewOptions() {
        return {
            enableScripts: true,
            localResourceRoots: [
                Uri.joinPath(this._extensionContext.extensionUri, 'out'),
                Uri.joinPath(this._extensionContext.extensionUri, 'webview-ui/build'),
            ],
        };
    }

    // ── Despacho de mensagens (único ponto de entrada) ─────────────────────

    /**
     * Trata uma mensagem vinda da interface. Os parâmetros extras existem
     * para os testes injetarem fakes; em produção só `message` é passado.
     */
    public async handleMessage(
        message: PanelMessage | { command: string; [k: string]: unknown },
        fetchRepos?: FetchRepositoriesFn,
        fetchScore?: FetchScoreForRepoFn,
        ws?: ActionDeps['workspace'],
        fs?: ActionDeps['fs'],
        win?: ActionDeps['window'],
    ): Promise<boolean> {
        const defaults = defaultActionDeps();
        const actionDeps: ActionDeps = {
            workspace: ws ?? defaults.workspace,
            fs: fs ?? defaults.fs,
            window: win ?? defaults.window,
        };

        switch (message.command) {
            case 'save_action':
                try {
                    await this._saveWorkflowFile(String(message.yaml), actionDeps);
                    this.post({command: 'action_saved'});
                } catch (err) {
                    actionDeps.window.showErrorMessage(`Não foi possível salvar o workflow: ${err}`);
                }
                return true;

            case 'run_action':
                await this._runAction(String(message.yaml), actionDeps);
                return true;

            case 'stop_analysis':
                if (this._actRunner.isRunning && this._actionState === 'running') {
                    this._actionState = 'stopping';
                    await this._actRunner.stop();
                }
                return true;

            case 'request_yaml':
                await this._sendExistingWorkflow(actionDeps);
                return true;

            case 'show_warning':
                actionDeps.window.showWarningMessage?.(String(message.message));
                return true;

            default:
                return this._handleCommonMessage(message, fetchRepos, fetchScore);
        }
    }

    protected async _handleCommonMessage(
        message: { command: string; [k: string]: unknown },
        fetchRepos: FetchRepositoriesFn = defaultFetchRepositories,
        fetchScore: FetchScoreForRepoFn = defaultFetchScoreForRepo,
    ): Promise<boolean> {
        const webview = this._webview;
        if (!webview) {
            return false;
        }

        switch (message.command) {
            case 'request_score':
                if (await this._refreshSettingsAndGate()) {
                    await this._loadReposAndScore(fetchRepos, fetchScore);
                }
                return true;

            case 'retry':
                if (await this._refreshSettingsAndGate()) {
                    await this._loadReposAndScore(fetchRepos, fetchScore);
                }
                return true;

            case 'select_org': {
                const org = this._context?.organizations?.find((o) => o.id === message.orgPk);
                if (!org) {
                    return true;
                }
                this._orgPkOverride = org.id;
                this._selectedRepo = null;
                await this._loadReposAndScore(fetchRepos, fetchScore);
                return true;
            }

            case 'clear_secret': {
                await clearSecret(message.key as SecretKey, this._settingsDeps);
                if (await this._refreshSettingsAndGate()) {
                    await this._loadReposAndScore(fetchRepos, fetchScore);
                }
                return true;
            }

            case 'open_vscode_settings': {
                const {commands} = require('vscode');
                await commands.executeCommand('workbench.action.openSettings', 'msgram');
                return true;
            }

            case 'register_repo': {
                const {commands} = require('vscode');
                await commands.executeCommand('msgram.registerRepo');
                return true;
            }

            case 'select_repo': {
                if (!this._context) {
                    return true;
                }
                const repo = this._context.repos.find((r: RepoItem) => r.id === message.repoPk);
                if (repo) {
                    this._selectedRepo = repo;
                    await this._loadScoreForSelected(fetchScore);
                }
                return true;
            }

            case 'save_settings':
                await this._persistSettings(message.data as SettingsPayload);
                this._context = null;
                this._selectedRepo = null;
                this._orgPkOverride = null;
                this.post({command: 'settings_saved'});
                if (await this._refreshSettingsAndGate()) {
                    await this._loadReposAndScore(fetchRepos, fetchScore);
                }
                return true;

            case 'request_grafana_dashboards':
                await this._loadGrafanaDashboards();
                return true;

            case 'request_grafana_dashboard':
                await this._loadGrafanaDashboardUrl(String(message.uid));
                return true;

            default:
                return false;
        }
    }

    // ── Grafana ────────────────────────────────────────────────────────────

    private async _loadGrafanaDashboards(): Promise<void> {
        if (!this._webview) {
            return;
        }
        this.post({command: 'grafana_loading'});
        try {
            const settings = await this._requireSettings();
            const dashboards = await this._fetchGrafanaDashboards(settings, this.logger());
            this.post({command: 'grafana_dashboards_loaded', dashboards});
        } catch (err) {
            this.post({command: 'grafana_error', message: this._errorMessage(err, 'Erro ao buscar dashboards do Grafana.')});
        }
    }

    private async _loadGrafanaDashboardUrl(uid: string): Promise<void> {
        if (!this._webview || !this._context) {
            return;
        }
        this.post({command: 'grafana_loading'});
        try {
            const settings = await this._requireSettings();
            const detail = await this._fetchGrafanaDashboard(
                settings,
                uid,
                this._context.productPk,
                this._selectedRepo?.id,
                this.logger(),
            );
            this._assertGrafanaUrlAllowed(detail.grafana_url, settings.grafanaAllowedHosts);
            this.post({command: 'grafana_dashboard_loaded', url: detail.grafana_url, title: detail.title});
        } catch (err) {
            this.post({command: 'grafana_error', message: this._errorMessage(err, 'Erro ao buscar dashboard do Grafana.')});
        }
    }

    /**
     * Só carrega dashboards por HTTPS e, se msgram.grafanaAllowedHosts estiver
     * configurado, só de hosts dessa lista (FR-017, M8).
     */
    protected _assertGrafanaUrlAllowed(url: string, allowedHosts: string[] = []): void {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error(`Endereço do dashboard inválido: ${url}`);
        }
        if (parsed.protocol !== 'https:') {
            throw new Error(`O dashboard precisa ser servido por HTTPS: ${parsed.origin}`);
        }
        if (allowedHosts.length) {
            const host = parsed.host.toLowerCase();
            const hostname = parsed.hostname.toLowerCase();
            const allowed = allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean);
            if (!allowed.includes(host) && !allowed.includes(hostname)) {
                throw new Error(`Endereço do dashboard não permitido: ${parsed.host}. Hosts permitidos: ${allowed.join(', ')}`);
            }
        }
    }

    // ── Action (compartilhado por painel e barra lateral) ──────────────────

    protected _workspacePath(deps: ActionDeps): string {
        const folder = deps.workspace.workspaceFolders?.[0];
        if (!folder) {
            throw new Error('Abra uma pasta/workspace antes de salvar o workflow.');
        }
        return folder.uri.fsPath;
    }

    /**
     * Responde a request_yaml com o conteúdo do msgram.yml do projeto, se
     * existir. Sem arquivo (ou sem workspace) responde exists:false e yaml
     * vazio; a interface usa o modelo padrão dela. Assim o arquivo da
     * pessoa nunca é sobrescrito pelo modelo sem ela ver (A5, FR-011).
     */
    protected async _sendExistingWorkflow(deps: ActionDeps): Promise<void> {
        let workspacePath: string;
        try {
            workspacePath = this._workspacePath(deps);
        } catch {
            this.post({command: 'yaml_loaded', yaml: '', exists: false});
            return;
        }
        const workflowAbsPath = path.join(workspacePath, WORKFLOW_REL_PATH);
        try {
            const readFile = deps.fs.readFile ?? defaultFs.readFile;
            const content = await readFile(workflowAbsPath, 'utf-8');
            this.post({command: 'yaml_loaded', yaml: String(content), exists: true});
        } catch (err) {
            const code = (err as NodeJS.ErrnoException)?.code;
            if (code !== 'ENOENT') {
                this.logger()(`[ERRO] Não foi possível ler ${workflowAbsPath}: ${(err as Error).message}`);
            }
            this.post({command: 'yaml_loaded', yaml: '', exists: false});
        }
    }

    protected async _saveWorkflowFile(yaml: string, deps: ActionDeps): Promise<string> {
        const workspacePath = this._workspacePath(deps);
        const workflowAbsPath = path.join(workspacePath, WORKFLOW_REL_PATH);
        await deps.fs.mkdir(path.dirname(workflowAbsPath), {recursive: true});
        await deps.fs.writeFile(workflowAbsPath, yaml, 'utf-8');
        return workspacePath;
    }

    /**
     * Execução local da Action (US5, FR-014): salva o workflow (ação
     * explícita da pessoa; o editor já mostra o conteúdo mesclado), confere
     * tokens e Docker, e transmite a saída do act para a aba Saída.
     */
    protected async _runAction(yaml: string, deps: ActionDeps): Promise<void> {
        if (this._actRunner.isRunning || this._actionState !== 'idle') {
            this.post({command: 'analysis_blocked', reason: 'already_running'});
            return;
        }

        let workspacePath: string;
        try {
            workspacePath = await this._saveWorkflowFile(yaml, deps);
        } catch (err) {
            this.post({command: 'analysis_blocked', reason: 'no_workspace', detail: `${(err as Error).message ?? err}`});
            return;
        }

        const settings = await this._requireSettings();
        const missing: string[] = [];
        if (!settings.githubToken) {
            missing.push('GitHub Token');
        }
        if (!settings.token) {
            missing.push('MSGRAM Service Token');
        }
        if (missing.length) {
            deps.window.showWarningMessage?.(`Configure em Settings antes de executar: ${missing.join(', ')}.`);
            return;
        }

        this._actionState = 'checking_docker';
        const check = await this._actRunner.checkDocker();
        if (!check.ok) {
            this._actionState = 'idle';
            this.logger()(`[ERRO] Docker indisponível (${check.reason}): ${check.detail}`);
            this.post({command: 'analysis_blocked', reason: check.reason, detail: check.detail});
            return;
        }

        const dockerDir = Uri.joinPath(this._extensionContext.extensionUri, 'resources', 'docker').fsPath;
        const log = this.logger();

        this._actionState = 'running';
        this.post({command: 'analysis_started'});
        log(`[act] Docker ${check.version} · iniciando workflow_dispatch em ${workspacePath}`);

        const started = this._actRunner.run({
            workspacePath,
            workflowRelPath: WORKFLOW_REL_PATH,
            dockerDir,
            githubToken: settings.githubToken,
            msgramToken: settings.token,
            onLine: (line, isError) => {
                log(`[act] ${line}`);
                this.post({command: 'output_line', line, isError});
            },
            onDone: (result) => {
                const wasStopping = this._actionState === 'stopping' || result.stopped;
                this._actionState = 'idle';
                if (wasStopping) {
                    log('[act] execução interrompida pela pessoa');
                    this.post({command: 'analysis_stopped'});
                } else {
                    log(`[act] encerrou com código ${result.exitCode}`);
                    this.post({command: 'analysis_done', success: result.success, exitCode: result.exitCode});
                }
            },
        });

        if (!started) {
            this._actionState = 'idle';
            this.post({command: 'analysis_blocked', reason: 'already_running'});
        }
    }
}
