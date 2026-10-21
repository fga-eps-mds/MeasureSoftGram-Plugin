/**
 * Árvore nativa da barra lateral ("Qualidade"), no estilo das extensões
 * Python/Airflow: TreeView com ícones do editor, Quick Pick para trocar
 * organização e repositório, e viewsWelcome quando falta configuração.
 *
 * Os dados vêm dos mesmos serviços do painel (config/settings, msgramApi).
 */
import {
    commands,
    Event,
    EventEmitter,
    MarkdownString,
    ThemeColor,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    window,
    workspace,
} from 'vscode';
import {FullSettings, isConfigured, loadSettings, SettingsDeps, updateProjectSettings} from '../config/settings';
import {resolveRepoContext} from '../services/repoResolver';
import {
    discoverRepository as defaultDiscover,
    fetchGrafanaDashboards as defaultFetchDashboards,
    fetchRepositories as defaultFetchRepositories,
    fetchScoreForRepo as defaultFetchScoreForRepo,
    GrafanaDashboard,
    RepoContext,
    RepoItem,
    ScoreData,
} from '../services/msgramApi';
import {HttpError} from '../services/httpClient';
import {detectWorkspaceHints} from '../utilities/workspaceRepo';
import {getOutputChannel} from '../utilities/log';
import type {MsgramStatusBar} from '../statusbar/msgramStatusBar';

export type NodeKind =
    | 'product' | 'repo' | 'score' | 'lastAnalysis' | 'characteristics' | 'characteristic'
    | 'dashboards' | 'dashboard' | 'error' | 'loading' | 'noData' | 'actions' | 'action';

export interface QualityNode {
    kind: NodeKind;
    label: string;
    description?: string;
    tooltip?: string;
    icon?: ThemeIcon;
    command?: { command: string; title: string; arguments?: unknown[] };
    children?: QualityNode[];
    contextValue?: string;
}

export interface QualityTreeDeps {
    settingsDeps: SettingsDeps;
    fetchRepositories?: typeof defaultFetchRepositories;
    fetchScoreForRepo?: typeof defaultFetchScoreForRepo;
    fetchDashboards?: typeof defaultFetchDashboards;
    discoverRepository?: typeof defaultDiscover;
    detectHints?: () => Promise<{ remoteName?: string; folderName?: string }>;
    statusBar?: MsgramStatusBar;
    setContext?: (key: string, value: unknown) => Thenable<unknown>;
}

type State = 'not_configured' | 'unregistered' | 'loading' | 'ready' | 'error';

export class QualityTreeProvider implements TreeDataProvider<QualityNode> {
    private readonly _onDidChangeTreeData = new EventEmitter<QualityNode | undefined>();
    public readonly onDidChangeTreeData: Event<QualityNode | undefined> = this._onDidChangeTreeData.event;

    private _state: State = 'loading';
    private _settings: FullSettings | null = null;
    private _context: RepoContext | null = null;
    private _selectedRepo: RepoItem | null = null;
    private _score: ScoreData | null = null;
    private _dashboards: GrafanaDashboard[] | null = null;
    private _error: { message: string; kind: string } | null = null;
    private _orgPkOverride: number | null = null;
    private _loading: Promise<void> | null = null;
    private _unregisteredRepo: string | null = null;

    private readonly _fetchRepositories: typeof defaultFetchRepositories;
    private readonly _fetchScoreForRepo: typeof defaultFetchScoreForRepo;
    private readonly _fetchDashboards: typeof defaultFetchDashboards;
    private readonly _discover: typeof defaultDiscover;
    private readonly _detectHints: () => Promise<{ remoteName?: string; folderName?: string }>;
    private readonly _setContext: (key: string, value: unknown) => Thenable<unknown>;

    constructor(private readonly _deps: QualityTreeDeps) {
        this._fetchRepositories = _deps.fetchRepositories ?? defaultFetchRepositories;
        this._fetchScoreForRepo = _deps.fetchScoreForRepo ?? defaultFetchScoreForRepo;
        this._fetchDashboards = _deps.fetchDashboards ?? defaultFetchDashboards;
        this._discover = _deps.discoverRepository ?? defaultDiscover;
        this._detectHints = _deps.detectHints ?? (async () => {
            const folder = workspace.workspaceFolders?.[0];
            return folder ? detectWorkspaceHints(folder.uri.fsPath) : {};
        });
        this._setContext = _deps.setContext ?? ((key, value) => commands.executeCommand('setContext', key, value));
    }

    // ── Estado público ────────────────────────────────────────────────────

    get state(): State {
        return this._state;
    }

    get selectedRepo(): RepoItem | null {
        return this._selectedRepo;
    }

    get context(): RepoContext | null {
        return this._context;
    }

    private log(msg: string) {
        getOutputChannel().appendLine(`[tree] ${msg}`);
    }

    private fire() {
        this._onDidChangeTreeData.fire(undefined);
    }

    // ── Carga ─────────────────────────────────────────────────────────────

    /** Recarrega tudo (configuração → organização → produto → repositórios → score). */
    refresh(): Promise<void> {
        if (!this._loading) {
            this._loading = this._load().finally(() => (this._loading = null));
        }
        return this._loading;
    }

    private async _load(): Promise<void> {
        this._state = 'loading';
        this._error = null;
        this._dashboards = null;
        this.fire();
        this._deps.statusBar?.setLoading();

        try {
            const base = await loadSettings(this._deps.settingsDeps);
            this._settings = this._orgPkOverride !== null ? {...base, organizationPk: this._orgPkOverride} : base;
            const missing = isConfigured(this._settings);
            const onlyProduct = missing.length === 1 && missing[0] === 'productName';
            await this._setContext('msgram.configured', missing.length === 0 || onlyProduct);
            if (missing.length && !onlyProduct) {
                this._state = 'not_configured';
                this._context = null;
                this._selectedRepo = null;
                this._score = null;
                this._deps.statusBar?.setNotConfigured();
                this.fire();
                return;
            }

            const hints = await this._detectHints();
            const log = (m: string) => getOutputChannel().appendLine(m);
            const result = await resolveRepoContext(this._settings, hints, this._selectedRepo?.id ?? null, {
                fetchRepositories: this._fetchRepositories,
                discoverRepository: this._discover,
                persist: async (patch) => {
                    await updateProjectSettings(patch, this._deps.settingsDeps);
                    this._orgPkOverride = null;
                    const base = await loadSettings(this._deps.settingsDeps);
                    this._settings = base;
                },
                log,
            });

            if (result.kind === 'missingProduct') {
                this._context = null;
                this._selectedRepo = null;
                this._score = null;
                this._unregisteredRepo = hints.remoteName ?? hints.folderName ?? null;
                if (this._unregisteredRepo) {
                    // Há token e pasta aberta, mas o repositório não está em nenhum produto: mostra na árvore.
                    await this._setContext('msgram.configured', true);
                    this._state = 'unregistered';
                    this.log(`"${this._unregisteredRepo}" não está cadastrado em nenhum produto desta conta`);
                } else {
                    await this._setContext('msgram.configured', false);
                    this._state = 'not_configured';
                }
                this._deps.statusBar?.setNotConfigured();
                this.fire();
                return;
            }
            this._context = result.context;
            if (result.kind === 'empty') {
                this._selectedRepo = null;
                this._score = null;
                this._state = 'ready';
                this._deps.statusBar?.setNoData();
                this.fire();
                return;
            }
            if (result.switched) {
                this.log(`produto trocado para "${result.switched.productName}" (${result.switched.orgName}) pela pasta aberta`);
            } else if (result.detected) {
                this.log(`repositório da pasta aberta: ${result.selectedRepo.name}`);
            }
            this._selectedRepo = result.selectedRepo;
            await this._loadScore();
        } catch (err) {
            this._state = 'error';
            this._error = {
                message: err instanceof Error ? err.message : String(err),
                kind: err instanceof HttpError ? err.kind : 'other',
            };
            this._score = null;
            this._deps.statusBar?.setError();
            this.log(`erro: ${this._error.message}`);
            this.fire();
        }
    }

    private async _loadScore(): Promise<void> {
        if (!this._settings || !this._context || !this._selectedRepo) {
            return;
        }
        this._score = await this._fetchScoreForRepo(
            this._settings, this._context.orgPk, this._context.productPk,
            this._selectedRepo.id, this._selectedRepo.name, (m) => getOutputChannel().appendLine(m),
        );
        this._state = 'ready';
        if (this._score.noData) {
            this._deps.statusBar?.setNoData();
        } else {
            this._deps.statusBar?.setScore(this._score.score);
        }
        this.fire();
    }

    // ── Comandos ──────────────────────────────────────────────────────────

    async selectRepository(): Promise<void> {
        const repos = this._context?.repos ?? [];
        if (!repos.length) {
            void window.showInformationMessage('Nenhum repositório carregado. Configure o produto primeiro.');
            return;
        }
        const picked = await window.showQuickPick(
            repos.map((r) => ({label: r.name, description: r.id === this._selectedRepo?.id ? 'selecionado' : undefined, repo: r})),
            {placeHolder: 'Repositório do produto'},
        );
        if (picked && picked.repo.id !== this._selectedRepo?.id) {
            this._selectedRepo = picked.repo;
            this._state = 'loading';
            this.fire();
            try {
                await this._loadScore();
            } catch (err) {
                this._state = 'error';
                this._error = {message: err instanceof Error ? err.message : String(err), kind: err instanceof HttpError ? err.kind : 'other'};
                this._deps.statusBar?.setError();
                this.fire();
            }
        }
    }

    async selectOrganization(): Promise<void> {
        const orgs = this._context?.organizations ?? [];
        if (orgs.length < 2) {
            void window.showInformationMessage('Sua conta tem só uma organização.');
            return;
        }
        const picked = await window.showQuickPick(
            orgs.map((o) => ({label: o.name, description: `id ${o.id}${o.id === this._context?.orgPk ? ' · selecionada' : ''}`, org: o})),
            {placeHolder: 'Organização'},
        );
        if (picked && picked.org.id !== this._context?.orgPk) {
            this._orgPkOverride = picked.org.id;
            this._selectedRepo = null;
            await this.refresh();
        }
    }

    async loadDashboards(): Promise<GrafanaDashboard[]> {
        if (this._dashboards) {
            return this._dashboards;
        }
        if (!this._settings) {
            return [];
        }
        try {
            this._dashboards = await this._fetchDashboards(this._settings, (m) => getOutputChannel().appendLine(m));
        } catch (err) {
            this.log(`dashboards: ${(err as Error).message}`);
            this._dashboards = [];
        }
        return this._dashboards;
    }

    // ── TreeDataProvider ──────────────────────────────────────────────────

    getTreeItem(node: QualityNode): TreeItem {
        const collapsible = node.children?.length || node.kind === 'dashboards' || node.kind === 'characteristics'
            ? (node.kind === 'actions' ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded)
            : TreeItemCollapsibleState.None;
        const item = new TreeItem(node.label, collapsible);
        item.description = node.description;
        item.tooltip = node.tooltip ? new MarkdownString(node.tooltip) : undefined;
        item.iconPath = node.icon;
        item.command = node.command;
        item.contextValue = node.contextValue ?? node.kind;
        return item;
    }

    async getChildren(node?: QualityNode): Promise<QualityNode[]> {
        if (node) {
            if (node.kind === 'dashboards') {
                const list = await this.loadDashboards();
                if (!list.length) {
                    return [{kind: 'noData', label: 'Nenhum dashboard disponível', icon: new ThemeIcon('info')}];
                }
                return list.map((d) => ({
                    kind: 'dashboard',
                    label: d.title,
                    description: d.has_repo_selector ? 'por repositório' : undefined,
                    icon: new ThemeIcon('graph'),
                    command: {command: 'msgram.openDashboard', title: 'Abrir dashboard', arguments: [d.uid]},
                }));
            }
            return node.children ?? [];
        }
        return this.rootNodes();
    }

    rootNodes(): QualityNode[] {
        if (this._state === 'not_configured') {
            // viewsWelcome cuida da mensagem; a árvore fica vazia.
            return [];
        }
        if (this._state === 'unregistered') {
            return [
                {
                    kind: 'error',
                    label: `"${this._unregisteredRepo}" não está cadastrado`,
                    description: 'em nenhum produto desta conta',
                    tooltip: 'Cadastre o repositório em um produto no site do MeasureSoftGram (Repositories → importar) e rode a Action uma vez. Ou informe o produto em Configurar.',
                    icon: new ThemeIcon('repo', new ThemeColor('charts.yellow')),
                },
                {kind: 'action', label: 'Cadastrar automaticamente', description: 'cria o repositório no produto que você escolher', icon: new ThemeIcon('cloud-upload'), command: {command: 'msgram.registerRepo', title: 'Cadastrar'}},
                {kind: 'action', label: 'Abrir o site do MeasureSoftGram', icon: new ThemeIcon('link-external'), command: {command: 'msgram.openSite', title: 'Abrir site'}},
                {kind: 'action', label: 'Informar o produto manualmente', icon: new ThemeIcon('gear'), command: {command: 'msgram.openSettings', title: 'Configurar'}},
                {kind: 'action', label: 'Atualizar', icon: new ThemeIcon('refresh'), command: {command: 'msgram.refresh', title: 'Atualizar'}},
            ];
        }
        if (this._state === 'loading' && !this._score) {
            return [{kind: 'loading', label: 'Carregando…', icon: new ThemeIcon('loading~spin')}];
        }
        if (this._state === 'error' && this._error) {
            return [
                {
                    kind: 'error',
                    label: this._error.kind === 'auth' ? 'Token inválido ou expirado' : 'Não foi possível carregar',
                    description: this._error.kind,
                    tooltip: this._error.message,
                    icon: new ThemeIcon('error', new ThemeColor('errorForeground')),
                    command: {command: 'msgram.refresh', title: 'Tentar de novo'},
                },
                this.actionsNode(),
            ];
        }

        const ctx = this._context;
        const nodes: QualityNode[] = [];
        if (ctx) {
            nodes.push({
                kind: 'product',
                label: ctx.productName,
                description: ctx.orgName,
                tooltip: `Produto **${ctx.productName}** · organização **${ctx.orgName}**` +
                    (ctx.organizations.length > 1 ? '\n\nClique para trocar de organização.' : ''),
                icon: new ThemeIcon('package'),
                command: ctx.organizations.length > 1 ? {command: 'msgram.selectOrganization', title: 'Trocar organização'} : undefined,
            });
        }
        if (this._selectedRepo) {
            nodes.push({
                kind: 'repo',
                label: this._selectedRepo.name,
                description: (ctx?.repos.length ?? 0) > 1 ? `${ctx!.repos.length} repositórios` : undefined,
                tooltip: 'Clique para trocar de repositório.',
                icon: new ThemeIcon('repo'),
                command: {command: 'msgram.selectRepository', title: 'Trocar repositório'},
            });
        } else if (ctx) {
            nodes.push({kind: 'noData', label: 'Produto sem repositórios', icon: new ThemeIcon('info')});
        }

        const s = this._score;
        if (s && s.noData) {
            nodes.push({kind: 'noData', label: 'Sem métricas calculadas', description: 'rode a Action', icon: new ThemeIcon('circle-slash')});
        } else if (s) {
            const goals = s.characteristics.filter((c) => c.goal !== null);
            const avgGoal = goals.length ? goals.reduce((a, c) => a + (c.goal ?? 0), 0) / goals.length : null;
            const ok = avgGoal === null ? null : s.score >= avgGoal;
            nodes.push({
                kind: 'score',
                label: `TSQMI ${s.score.toFixed(2)}`,
                description: avgGoal === null ? 'sem meta' : `meta ${avgGoal.toFixed(2)} ${ok ? '✓' : '✗'}`,
                icon: new ThemeIcon('dashboard', new ThemeColor(ok === false ? 'charts.red' : ok ? 'charts.green' : 'charts.yellow')),
                command: {command: 'msgram.run', title: 'Abrir painel'},
            });
            nodes.push({
                kind: 'lastAnalysis',
                label: s.lastAnalysisAt ? `Última análise ${relative(s.lastAnalysisAt)}` : 'Nunca analisado',
                tooltip: s.lastAnalysisAt ? new Date(s.lastAnalysisAt).toLocaleString('pt-BR') : undefined,
                icon: new ThemeIcon('history'),
            });
            nodes.push({
                kind: 'characteristics',
                label: 'Características',
                description: `${s.characteristics.length}`,
                icon: new ThemeIcon('list-tree'),
                children: s.characteristics.map((c) => {
                    const below = c.goal !== null && c.value < c.goal;
                    const near = c.goal !== null && !below && c.value < c.goal * 1.1;
                    return {
                        kind: 'characteristic' as const,
                        label: c.name,
                        description: `${c.value.toFixed(2)}${c.goal !== null ? ` / meta ${c.goal.toFixed(2)}` : ''}`,
                        tooltip: `**${c.name}**: ${c.value.toFixed(2)}${c.goal !== null ? ` (meta ${c.goal.toFixed(2)})` : ' (sem meta)'}\n\nMedido em ${new Date(c.measuredAt).toLocaleString('pt-BR')}`,
                        icon: new ThemeIcon(
                            below ? 'warning' : 'pass',
                            new ThemeColor(below ? 'charts.red' : near ? 'charts.yellow' : 'charts.green'),
                        ),
                    };
                }),
            });
        }
        if (ctx) {
            nodes.push({kind: 'dashboards', label: 'Dashboards Grafana', icon: new ThemeIcon('graph-line')});
        }
        nodes.push(this.actionsNode());
        return nodes;
    }

    private actionsNode(): QualityNode {
        return {
            kind: 'actions',
            label: 'Ações',
            icon: new ThemeIcon('tools'),
            children: [
                {kind: 'action', label: 'Abrir painel completo', icon: new ThemeIcon('window'), command: {command: 'msgram.run', title: 'Abrir painel'}},
                {kind: 'action', label: 'Executar Action localmente', description: 'requer Docker', icon: new ThemeIcon('play'), command: {command: 'msgram.openActionTab', title: 'Executar'}},
                {kind: 'action', label: 'Configurar', icon: new ThemeIcon('gear'), command: {command: 'msgram.openSettings', title: 'Configurar'}},
                {kind: 'action', label: 'Atualizar', icon: new ThemeIcon('refresh'), command: {command: 'msgram.refresh', title: 'Atualizar'}},
            ],
        };
    }
}

function relative(iso: string): string {
    const diff = Math.max(0, Date.now() - new Date(iso).getTime());
    const min = Math.floor(diff / 60000);
    if (min < 1) {
        return 'agora há pouco';
    }
    if (min < 60) {
        return `há ${min} min`;
    }
    const h = Math.floor(min / 60);
    if (h < 24) {
        return `há ${h} h`;
    }
    const d = Math.floor(h / 24);
    return `há ${d} dia${d === 1 ? '' : 's'}`;
}
