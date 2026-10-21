import * as assert from 'assert';
import {QualityNode, QualityTreeProvider} from '../../views/qualityTree';
import type {SettingsDeps} from '../../config/settings';
import {HttpError} from '../../services/httpClient';

function makeSettingsDeps(opts: { token?: string; productName?: string } = {}): SettingsDeps {
    const config: Record<string, unknown> = {productName: opts.productName};
    const secrets: Record<string, string> = {};
    if (opts.token) { secrets['msgram.token'] = opts.token; }
    return {
        getConfiguration: () => ({
            get: <T>(k: string, def?: T) => (config[k] as T) ?? def,
            update: async (k: string, v: unknown) => { config[k] = v; },
        }),
        secrets: {
            get: async (k: string) => secrets[k],
            store: async (k: string, v: string) => { secrets[k] = v; },
            delete: async (k: string) => { delete secrets[k]; },
        },
        hasWorkspaceFolder: () => true,
        ConfigurationTarget: {Global: 1, Workspace: 2},
    };
}

function makeStatusBar() {
    return {
        calls: [] as string[],
        setLoading() { this.calls.push('loading'); },
        setScore(_s: number) { this.calls.push('score'); },
        setNoData() { this.calls.push('noData'); },
        setError() { this.calls.push('error'); },
        setNotConfigured() { this.calls.push('notConfigured'); },
        dispose() {},
    };
}

const REPOS = [{id: 1, name: 'Service'}, {id: 2, name: 'MeasureSoftGram-Plugin'}];
const CTX = {orgPk: 10, orgName: 'EPS/MDS', organizations: [{id: 10, name: 'EPS/MDS'}, {id: 11, name: 'Outra'}], productPk: 20, productName: 'Measure', repos: REPOS};
const SCORE = {
    score: 0.86, noData: false, hasGoal: true, lastAnalysisAt: '2026-10-01T00:00:00Z',
    characteristics: [
        {key: 'reliability', name: 'Reliability', value: 0.57, goal: 0.8, measuredAt: '2026-10-01T00:00:00Z'},
        {key: 'maintainability', name: 'Maintainability', value: 0.95, goal: 0.8, measuredAt: '2026-10-01T00:00:00Z'},
    ],
};

function makeTree(opts: {
    token?: string; productName?: string;
    repos?: any; score?: any; hints?: any; dashboards?: any; discover?: any;
} = {}) {
    const contextKeys: Record<string, unknown> = {};
    const statusBar = makeStatusBar();
    const tree = new QualityTreeProvider({
        settingsDeps: makeSettingsDeps({token: opts.token, productName: opts.productName}),
        fetchRepositories: opts.repos ?? (async () => CTX),
        fetchScoreForRepo: opts.score ?? (async () => SCORE),
        fetchDashboards: opts.dashboards ?? (async () => [{uid: 'u1', title: 'Visão Geral', description: '', tags: [], has_repo_selector: false}]),
        discoverRepository: opts.discover ?? (async () => null),
        detectHints: opts.hints ?? (async () => ({})),
        statusBar: statusBar as any,
        setContext: async (k, v) => { contextKeys[k] = v; },
    });
    return {tree, statusBar, contextKeys};
}

const labels = (nodes: QualityNode[]) => nodes.map((n) => n.label);

suite('QualityTreeProvider — estados', () => {
    test('sem token: árvore vazia, contexto msgram.configured=false e status bar "configurar"', async () => {
        const {tree, statusBar, contextKeys} = makeTree({productName: 'P'});
        await tree.refresh();
        assert.strictEqual(tree.state, 'not_configured');
        assert.deepStrictEqual(await tree.getChildren(), []);
        assert.strictEqual(contextKeys['msgram.configured'], false);
        assert.ok(statusBar.calls.includes('notConfigured'));
    });

    test('configurado: produto, repositório, TSQMI, última análise, características, dashboards e ações', async () => {
        const {tree, statusBar, contextKeys} = makeTree({token: 'tok', productName: 'Measure'});
        await tree.refresh();
        assert.strictEqual(tree.state, 'ready');
        assert.strictEqual(contextKeys['msgram.configured'], true);
        const root = await tree.getChildren();
        assert.deepStrictEqual(root.map((n) => n.kind), ['product', 'repo', 'score', 'lastAnalysis', 'characteristics', 'dashboards', 'actions']);
        assert.strictEqual(root[0].label, 'Measure');
        assert.strictEqual(root[0].description, 'EPS/MDS');
        assert.strictEqual(root[2].label, 'TSQMI 0.86');
        assert.ok(root[2].description?.includes('meta 0.80'));
        assert.strictEqual(statusBar.calls[statusBar.calls.length - 1], 'score');
    });

    test('características viram filhos com valor e meta; abaixo da meta usa ícone de aviso', async () => {
        const {tree} = makeTree({token: 'tok', productName: 'Measure'});
        await tree.refresh();
        const chars = (await tree.getChildren()).find((n) => n.kind === 'characteristics')!;
        const kids = await tree.getChildren(chars);
        assert.deepStrictEqual(labels(kids), ['Reliability', 'Maintainability']);
        assert.strictEqual(kids[0].description, '0.57 / meta 0.80');
        assert.strictEqual((kids[0].icon as any).id, 'warning');
        assert.strictEqual((kids[1].icon as any).id, 'pass');
    });

    test('dashboards são carregados sob demanda e abrem pelo comando msgram.openDashboard', async () => {
        const {tree} = makeTree({token: 'tok', productName: 'Measure'});
        await tree.refresh();
        const dash = (await tree.getChildren()).find((n) => n.kind === 'dashboards')!;
        const kids = await tree.getChildren(dash);
        assert.strictEqual(kids[0].label, 'Visão Geral');
        assert.deepStrictEqual(kids[0].command, {command: 'msgram.openDashboard', title: 'Abrir dashboard', arguments: ['u1']});
    });

    test('erro de autenticação vira nó de erro com "Tentar de novo"', async () => {
        const {tree, statusBar} = makeTree({token: 'tok', productName: 'Measure', repos: async () => { throw new HttpError('HTTP 401', 'auth', 401); }});
        await tree.refresh();
        assert.strictEqual(tree.state, 'error');
        const root = await tree.getChildren();
        assert.strictEqual(root[0].kind, 'error');
        assert.strictEqual(root[0].label, 'Token inválido ou expirado');
        assert.strictEqual(root[0].command?.command, 'msgram.refresh');
        assert.ok(statusBar.calls.includes('error'));
    });

    test('noData: nó "Sem métricas calculadas" e status bar sem dados', async () => {
        const {tree, statusBar} = makeTree({token: 'tok', productName: 'Measure', score: async () => ({...SCORE, noData: true, score: 0, characteristics: []})});
        await tree.refresh();
        const root = await tree.getChildren();
        assert.ok(root.some((n) => n.label === 'Sem métricas calculadas'));
        assert.ok(statusBar.calls.includes('noData'));
    });
});

suite('QualityTreeProvider — seleção', () => {
    test('seleciona o repositório da pasta aberta', async () => {
        const {tree} = makeTree({token: 'tok', productName: 'Measure', hints: async () => ({remoteName: '2026.1-MeasureSoftGram-Plugin'})});
        await tree.refresh();
        assert.strictEqual(tree.selectedRepo?.id, 2);
    });

    test('selectRepository usa o Quick Pick e recarrega o score', async () => {
        const vscode = require('vscode');
        const calls: number[] = [];
        const {tree} = makeTree({token: 'tok', productName: 'Measure', score: async (_s: any, _o: any, _p: any, repoPk: number) => { calls.push(repoPk); return SCORE; }});
        await tree.refresh();
        const original = vscode.window.showQuickPick;
        vscode.window.showQuickPick = async (items: any[]) => items.find((i) => i.label === 'MeasureSoftGram-Plugin');
        try {
            await tree.selectRepository();
        } finally {
            vscode.window.showQuickPick = original;
        }
        assert.strictEqual(tree.selectedRepo?.id, 2);
        assert.deepStrictEqual(calls, [1, 2]);
    });

    test('selectOrganization recarrega com organizationPk', async () => {
        const vscode = require('vscode');
        const seen: any[] = [];
        const {tree} = makeTree({token: 'tok', productName: 'Measure', repos: async (s: any) => { seen.push(s.organizationPk); return CTX; }});
        await tree.refresh();
        const original = vscode.window.showQuickPick;
        vscode.window.showQuickPick = async (items: any[]) => items.find((i) => i.label === 'Outra');
        try {
            await tree.selectOrganization();
        } finally {
            vscode.window.showQuickPick = original;
        }
        assert.deepStrictEqual(seen, [undefined, 11]);
    });

    test('getTreeItem mapeia label, descrição, ícone e comando', async () => {
        const {tree} = makeTree({token: 'tok', productName: 'Measure'});
        await tree.refresh();
        const root = await tree.getChildren();
        const item = tree.getTreeItem(root[1]);
        assert.strictEqual(item.label, 'Service');
        assert.strictEqual(item.command?.command, 'msgram.selectRepository');
        assert.strictEqual(item.contextValue, 'repo');
        const chars = tree.getTreeItem(root.find((n) => n.kind === 'characteristics')!);
        assert.strictEqual(chars.collapsibleState, 2, 'expandido');
        const actions = tree.getTreeItem(root.find((n) => n.kind === 'actions')!);
        assert.strictEqual(actions.collapsibleState, 1, 'recolhido');
    });

    test('pasta aberta em outro produto: descobre, persiste e mostra o produto novo', async () => {
        const FOUND = {orgPk: 2, orgName: 'Luiza Maluf', organizations: CTX.organizations, productPk: 20, productName: 'Integracao', repos: [{id: 200, name: 'Integracao-de-Dados'}], repo: {id: 200, name: 'Integracao-de-Dados'}};
        const {tree} = makeTree({token: 'tok', productName: 'Measure', hints: async () => ({remoteName: 'Integracao-de-Dados'}), discover: async () => FOUND});
        await tree.refresh();
        assert.strictEqual(tree.state, 'ready');
        assert.strictEqual(tree.selectedRepo?.id, 200);
        const root = await tree.getChildren();
        assert.strictEqual(root[0].label, 'Integracao');
        assert.strictEqual(root[0].description, 'Luiza Maluf');
    });

    test('sem produto configurado mas com pasta cadastrada: msgram.configured fica true e carrega', async () => {
        const FOUND = {orgPk: 1, orgName: 'EPS/MDS', organizations: CTX.organizations, productPk: 10, productName: 'Measure', repos: REPOS, repo: REPOS[1]};
        const {tree, contextKeys} = makeTree({token: 'tok', hints: async () => ({folderName: 'MeasureSoftGram-Plugin'}), discover: async () => FOUND});
        await tree.refresh();
        assert.strictEqual(tree.state, 'ready');
        assert.strictEqual(contextKeys['msgram.configured'], true);
    });

    test('sem produto e pasta aberta não cadastrada: estado "unregistered" com ações na árvore', async () => {
        const {tree, contextKeys} = makeTree({token: 'tok', hints: async () => ({folderName: 'x'})});
        await tree.refresh();
        assert.strictEqual(tree.state, 'unregistered');
        assert.strictEqual(contextKeys['msgram.configured'], true, 'a árvore mostra o aviso, não a tela de boas-vindas');
        const root = await tree.getChildren();
        assert.ok(root[0].label.includes('"x"') && root[0].label.includes('não está cadastrado'));
        assert.ok(root.some((n) => n.command?.command === 'msgram.openSite'));
        assert.ok(root.some((n) => n.command?.command === 'msgram.registerRepo'));
        assert.ok(root.some((n) => n.command?.command === 'msgram.openSettings'));
    });

    test('sem produto e sem pasta aberta: not_configured (tela de boas-vindas)', async () => {
        const {tree, contextKeys} = makeTree({token: 'tok', hints: async () => ({})});
        await tree.refresh();
        assert.strictEqual(tree.state, 'not_configured');
        assert.strictEqual(contextKeys['msgram.configured'], false);
    });
});
