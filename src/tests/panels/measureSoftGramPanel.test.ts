import * as assert from 'assert';
import { MeasureSoftGramPanel } from '../../panels/measureSoftGramPanel';

function makeWebview() {
    const messages: any[] = [];
    let listener: ((msg: any) => void) | null = null;
    return {
        html: '',
        cspSource: 'https://csp.example.com',
        postMessage(msg: any) { messages.push(msg); },
        onDidReceiveMessage(handler: (msg: any) => void) {
            listener = handler;
            return { dispose: () => {} };
        },
        asWebviewUri: (uri: any) => uri,
        _messages: messages,
        _emit(msg: any) { listener?.(msg); },
    };
}

function makePanel(webview: ReturnType<typeof makeWebview>) {
    const disposals: any[] = [];
    return {
        webview,
        reveal: (_col: any) => {},
        dispose: () => {},
        onDidDispose(_cb: () => void, _null: any, _arr: any[]) {},
        _disposals: disposals,
    };
}

function makeExtensionContext() {
    const ws: Record<string, any> = {};
    const sec: Record<string, string> = { 'msgram.token': 'tok' };
    (require('vscode').workspace._config.msgram ??= {}).productName = 'measuresoftgram';
    return {
        workspaceState: {
            get<T>(key: string, def: T): T { return ws[key] ?? def; },
            update(key: string, v: any) { ws[key] = v; return Promise.resolve(); },
        },
        secrets: {
            get(key: string) { return Promise.resolve(sec[key] ?? ''); },
            store(key: string, v: string) { sec[key] = v; return Promise.resolve(); },
            delete(key: string) { delete sec[key]; return Promise.resolve(); },
        },
        extensionUri: { fsPath: '/fake/ext', toString: () => 'file:///fake/ext' },
    };
}

function makeVsWindow(webview: ReturnType<typeof makeWebview>) {
    const panelInstance = makePanel(webview);
    return {
        createWebviewPanel: (_id: any, _title: any, _col: any, _opts: any) => panelInstance,
        _panel: panelInstance,
    };
}

function makeFetchRepos(repos = [{ id: 1, name: 'repo-x' }]) {
    return async () => ({ repos, orgPk: 1, orgName: 'org', organizations: [{ id: 1, name: 'org' }], productPk: 2, productName: 'P' });
}

function makeFetchScore(result: any = { score: 0.9, noData: false, characteristics: [] }) {
    return async () => result as any;
}

function makeFetchReposError(msg = 'fetch error') {
    return async () => { throw new Error(msg); };
}

function makeFetchScoreError(msg = 'score error') {
    return (async () => { throw new Error(msg); }) as any;
}

function makeActionDeps(overrides: {
    hasWorkspace?: boolean;
    mkdirFail?: boolean;
    writeFileFail?: boolean;
} = {}) {
    const written: { path: string; content: string }[] = [];
    const terminals: any[] = [];
    const errors: string[] = [];

    return {
        workspace: {
            workspaceFolders: overrides.hasWorkspace === false
                ? undefined
                : [{ uri: { fsPath: '/fake/workspace' } }] as any,
        },
        fs: {
            mkdir: async (_p: string, _opts: any) => {
                if (overrides.mkdirFail) { throw new Error('mkdir failed'); }
            },
            writeFile: async (p: string, content: string) => {
                if (overrides.writeFileFail) { throw new Error('writeFile failed'); }
                written.push({ path: p, content });
            },
        },
        window: {
            createTerminal: (opts: any) => {
                const t = { opts, texts: [] as string[], shown: false, show() { this.shown = true; }, sendText(t: string) { this.texts.push(t); } };
                terminals.push(t);
                return t;
            },
            showErrorMessage: (msg: string) => { errors.push(msg); },
        },
        _written: written,
        _terminals: terminals,
        _errors: errors,
    };
}

function createPanel(webview = makeWebview()) {
    const ctx = makeExtensionContext();
    const vsWindow = makeVsWindow(webview);
    MeasureSoftGramPanel.currentPanel = undefined;
    MeasureSoftGramPanel.render(ctx as any, undefined, vsWindow as any);
    const panel = MeasureSoftGramPanel.currentPanel!;
    return { panel, webview, ctx };
}

suite('MeasureSoftGramPanel — render', () => {
    teardown(() => { MeasureSoftGramPanel.currentPanel = undefined; });

    test('render cria o painel e define currentPanel', () => {
        const { panel } = createPanel();
        assert.ok(panel instanceof MeasureSoftGramPanel);
        assert.strictEqual(MeasureSoftGramPanel.currentPanel, panel);
    });

    test('render chamado duas vezes reutiliza o painel existente', () => {
        const webview = makeWebview();
        const { panel: first } = createPanel(webview);

        const ctx = makeExtensionContext();
        const vsWindow = makeVsWindow(webview);
        MeasureSoftGramPanel.render(ctx as any, undefined, vsWindow as any);

        assert.strictEqual(MeasureSoftGramPanel.currentPanel, first);
    });

    test('dispose limpa currentPanel', () => {
        const { panel } = createPanel();
        panel.dispose();
        assert.strictEqual(MeasureSoftGramPanel.currentPanel, undefined);
    });
});

suite('MeasureSoftGramPanel — handleMessage: comandos comuns', () => {
    teardown(() => { MeasureSoftGramPanel.currentPanel = undefined; });

    test('request_score emite settings_loaded e score_loaded', async () => {
        const { panel, webview } = createPanel();
        await panel.handleMessage(
            { command: 'request_score' },
            makeFetchRepos(),
            makeFetchScore(),
        );

        const commands = webview._messages.map((m: any) => m.command);
        assert.ok(commands.includes('settings_loaded'));
        assert.ok(commands.includes('score_loaded'));
    });

    test('request_score com erro no fetchRepos emite score_error', async () => {
        const { panel, webview } = createPanel();
        await panel.handleMessage(
            { command: 'request_score' },
            makeFetchReposError('sem conexão'),
            makeFetchScore(),
        );

        const err = webview._messages.find((m: any) => m.command === 'score_error');
        assert.ok(err);
        assert.ok(err.message.includes('sem conexão'));
    });

    test('request_score com erro no fetchScore emite score_error', async () => {
        const { panel, webview } = createPanel();
        await panel.handleMessage(
            { command: 'request_score' },
            makeFetchRepos(),
            makeFetchScoreError('API indisponível'),
        );

        const err = webview._messages.find((m: any) => m.command === 'score_error');
        assert.ok(err?.message.includes('API indisponível'));
    });
});

suite('MeasureSoftGramPanel — handleMessage: save_action', () => {
    teardown(() => { MeasureSoftGramPanel.currentPanel = undefined; });

    test('salva o arquivo e emite action_saved', async () => {
        const { panel, webview } = createPanel();
        const deps = makeActionDeps();

        await panel.handleMessage(
            { command: 'save_action', yaml: 'on: push\njobs: {}' },
            undefined, undefined,
            deps.workspace as any, deps.fs as any, deps.window as any,
        );

        const saved = webview._messages.find((m: any) => m.command === 'action_saved');
        assert.ok(saved, 'deve emitir action_saved');
        assert.strictEqual(deps._written.length, 1);
        assert.ok(deps._written[0].path.includes('.github/workflows/msgram.yml'));
        assert.strictEqual(deps._written[0].content, 'on: push\njobs: {}');
    });

    test('sem workspace mostra mensagem de erro', async () => {
        const { panel } = createPanel();
        const deps = makeActionDeps({ hasWorkspace: false });

        await panel.handleMessage(
            { command: 'save_action', yaml: 'yaml: true' },
            undefined, undefined,
            deps.workspace as any, deps.fs as any, deps.window as any,
        );

        assert.strictEqual(deps._errors.length, 1);
        assert.ok(deps._errors[0].includes('Abra uma pasta'));
    });

    test('falha ao escrever o arquivo mostra mensagem de erro', async () => {
        const { panel } = createPanel();
        const deps = makeActionDeps({ writeFileFail: true });

        await panel.handleMessage(
            { command: 'save_action', yaml: 'yaml: true' },
            undefined, undefined,
            deps.workspace as any, deps.fs as any, deps.window as any,
        );

        assert.strictEqual(deps._errors.length, 1);
        assert.ok(deps._errors[0].includes('writeFile failed'));
    });
});

suite('MeasureSoftGramPanel — handleMessage: run_action (via ActRunner)', () => {
    teardown(() => { MeasureSoftGramPanel.currentPanel = undefined; });

    function fakeRunner(check: any) {
        return { isRunning: false, isStopping: false, runCalls: [] as any[],
            async checkDocker() { return check; },
            run(o: any) { this.isRunning = true; this.runCalls.push(o); return true; },
            async stop() {}, dispose() {} };
    }

    test('salva o workflow e, com Docker ausente, emite analysis_blocked sem abrir terminal', async () => {
        const { panel, webview, ctx } = createPanel();
        await (ctx as any).secrets.store('msgram.githubToken', 'ghp');
        const runner = fakeRunner({ ok: false, reason: 'docker_missing', detail: 'ENOENT' });
        (panel as any)._actRunner = runner;
        const deps = makeActionDeps();

        await panel.handleMessage(
            { command: 'run_action', yaml: 'on: push' },
            undefined, undefined,
            deps.workspace as any, deps.fs as any, deps.window as any,
        );

        assert.strictEqual(deps._written.length, 1, 'workflow salvo (ação explícita)');
        assert.strictEqual(deps._terminals.length, 0, 'nenhum terminal');
        assert.strictEqual(runner.runCalls.length, 0);
        const blocked = webview._messages.find((m: any) => m.command === 'analysis_blocked');
        assert.strictEqual(blocked?.reason, 'docker_missing');
    });

    test('run_action sem workspace emite analysis_blocked no_workspace', async () => {
        const { panel, webview } = createPanel();
        (panel as any)._actRunner = fakeRunner({ ok: true, version: '29' });
        const deps = makeActionDeps({ hasWorkspace: false });

        await panel.handleMessage(
            { command: 'run_action', yaml: 'on: push' },
            undefined, undefined,
            deps.workspace as any, deps.fs as any, deps.window as any,
        );

        assert.strictEqual(deps._terminals.length, 0);
        const blocked = webview._messages.find((m: any) => m.command === 'analysis_blocked');
        assert.strictEqual(blocked?.reason, 'no_workspace');
    });
});

suite('MeasureSoftGramPanel — status bar (US4)', () => {
    teardown(() => { MeasureSoftGramPanel.currentPanel = undefined; });

    function makeStatusBar() {
        return {
            calls: [] as string[],
            lastScore: undefined as number | undefined,
            setLoading()        { this.calls.push('loading'); },
            setScore(s: number) { this.calls.push('score'); this.lastScore = s; },
            setNoData()         { this.calls.push('noData'); },
            setError()          { this.calls.push('error'); },
            setNotConfigured()  { this.calls.push('notConfigured'); },
            dispose()           {},
        };
    }

    test('render recebe a status bar e o painel a atualiza ao carregar o score', async () => {
        const webview = makeWebview();
        const ctx = makeExtensionContext();
        const vsWindow = makeVsWindow(webview);
        const sb = makeStatusBar();
        MeasureSoftGramPanel.currentPanel = undefined;
        MeasureSoftGramPanel.render(ctx as any, sb as any, vsWindow as any);
        const panel = MeasureSoftGramPanel.currentPanel!;

        await panel.handleMessage({ command: 'request_score' }, makeFetchRepos(), makeFetchScore({ score: 0.77, noData: false, characteristics: [] }));

        assert.ok(sb.calls.includes('loading'));
        assert.strictEqual(sb.lastScore, 0.77);
        assert.strictEqual(sb.calls[sb.calls.length - 1], 'score', 'não fica em loading');
    });

    test('erro no painel leva a status bar para erro', async () => {
        const webview = makeWebview();
        const sb = makeStatusBar();
        MeasureSoftGramPanel.currentPanel = undefined;
        MeasureSoftGramPanel.render(makeExtensionContext() as any, sb as any, makeVsWindow(webview) as any);
        const panel = MeasureSoftGramPanel.currentPanel!;

        await panel.handleMessage({ command: 'request_score' }, makeFetchReposError('x'), makeFetchScore());

        assert.strictEqual(sb.calls[sb.calls.length - 1], 'error');
    });
});
