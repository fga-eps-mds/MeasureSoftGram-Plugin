/**
 * Fluxos ponta a ponta dentro de um VS Code real (quickstart §2–§5 e §7),
 * observando as mensagens que a extensão envia à interface via
 * `MeasureSoftGramBase.onDidPost`. Não há interface aqui: o que se valida é
 * o comportamento da extensão com SecretStorage, configuração, filesystem,
 * rede e Docker reais.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import type {MsgramExtensionApi} from '../../extension';
import type {ExtensionMessage} from '../../panels/messages';

const EXTENSION_ID = 'MeasureSoftGram.measuresoftgram';
const REAL_API = 'https://msgram.lappis.rocks';

type Cmd = ExtensionMessage['command'];

async function getApi(): Promise<MsgramExtensionApi> {
    const ext = vscode.extensions.getExtension<MsgramExtensionApi>(EXTENSION_ID)!;
    const api = await ext.activate();
    assert.ok(api?.sidebar, 'activate() deve expor a sidebar');
    return api;
}

async function waitFor(cond: () => boolean, ms: number, what: string): Promise<void> {
    const start = Date.now();
    while (!cond()) {
        if (Date.now() - start > ms) {
            throw new Error(`timeout esperando ${what}`);
        }
        await new Promise((r) => setTimeout(r, 100));
    }
}

/** Coleta mensagens até aparecer `until`, ou até o timeout. */
function collect(api: MsgramExtensionApi, until: Cmd[], ms: number): { posted: ExtensionMessage[]; done: Promise<void> } {
    const posted: ExtensionMessage[] = [];
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const sub = api.sidebar.onDidPost((m) => {
        posted.push(m);
        if (until.includes(m.command)) {
            sub.dispose();
            resolve();
        }
    });
    setTimeout(() => {
        sub.dispose();
        resolve();
    }, ms);
    return {posted, done};
}

const cmds = (posted: ExtensionMessage[]) => posted.map((m) => m.command);
const find = <C extends Cmd>(posted: ExtensionMessage[], c: C) =>
    posted.find((m) => m.command === c) as Extract<ExtensionMessage, { command: C }> | undefined;

suite('Fluxos reais — sidebar em VS Code real', () => {
    let api: MsgramExtensionApi;

    suiteSetup(async function () {
        this.timeout(60_000);
        api = await getApi();
        // A interface manda request_score ao montar (App.tsx). Se essa resposta
        // chegar no meio de um teste, polui as mensagens coletadas por ele; então
        // espera ela terminar antes de seguir. Assina antes do focus para não perdê-la.
        const mount = collect(api, ['not_configured', 'score_loaded', 'score_error'], 30_000);
        // Força o VS Code a resolver a view (cria o webview real).
        await vscode.commands.executeCommand('msgram.sidebarView.focus');
        await waitFor(() => api.sidebar.hasWebview, 20_000, 'sidebar resolver o webview');
        await mount.done;

        // Estado limpo: o user-data-dir é reaproveitado entre execuções.
        const c1 = collect(api, ['not_configured', 'score_loaded', 'score_error'], 20_000);
        await api.sidebar.handleMessage({command: 'clear_secret', key: 'msgram.token'});
        await api.sidebar.handleMessage({command: 'clear_secret', key: 'msgram.githubToken'});
        await c1.done;
        await vscode.workspace.getConfiguration('msgram').update('productName', '', vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('msgram').update('serviceUrl', REAL_API, vscode.ConfigurationTarget.Global);
    });

    test('§2 sem token: settings_loaded sem token e not_configured, sem tocar na rede', async function () {
        this.timeout(20_000);
        const {posted, done} = collect(api, ['not_configured', 'score_error', 'score_loaded'], 10_000);
        await api.sidebar.handleMessage({command: 'request_score'});
        await done;

        const settings = find(posted, 'settings_loaded');
        assert.ok(settings, cmds(posted).join(','));
        assert.strictEqual(settings!.data.hasMsgramToken, false);
        assert.strictEqual(settings!.data.serviceUrl, REAL_API, 'URL padrão oficial');
        assert.ok(!('token' in settings!.data), 'nunca envia o valor do token');

        const nc = find(posted, 'not_configured');
        assert.ok(nc, 'deve emitir not_configured');
        assert.ok(nc!.missing.includes('token'));
        assert.ok(!cmds(posted).includes('score_loading'), 'não tenta carregar');
        assert.ok(!cmds(posted).includes('score_loaded'), 'nenhum score inventado');
        assert.strictEqual(api.sidebar.loadState, 'not_configured');
    });

    test('§3/§4 com token inválido contra a API oficial: settings persistem e vem score_error com kind', async function () {
        this.timeout(45_000);
        const {posted, done} = collect(api, ['score_error', 'score_loaded'], 40_000);
        await api.sidebar.handleMessage({
            command: 'save_settings',
            data: {
                serviceUrl: REAL_API + '/',
                productName: 'measuresoftgram',
                organizationName: '',
                sonarProjectKey: 'chave-sonar',
                workflowName: 'Build',
                requestTimeoutMs: 15000,
                grafanaAllowedHosts: [],
                msgramServiceToken: 'token-invalido-de-teste',
                githubToken: 'ghp_token_falso_de_teste',
            },
        });
        await done;

        assert.ok(cmds(posted).includes('settings_saved'), cmds(posted).join(','));
        const settings = posted.filter((m) => m.command === 'settings_loaded').pop() as Extract<ExtensionMessage, { command: 'settings_loaded' }>;
        assert.strictEqual(settings.data.hasMsgramToken, true, 'token foi para o Secret Storage');
        assert.strictEqual(settings.data.hasGithubToken, true);
        assert.strictEqual(settings.data.sonarProjectKey, 'chave-sonar', 'campo não sensível persistido');
        assert.strictEqual(settings.data.serviceUrl, REAL_API, 'URL normalizada sem barra final');
        assert.ok(!JSON.stringify(settings).includes('token-invalido'), 'valor do token nunca vai à interface');

        // Persistiu de verdade na configuração do VS Code
        assert.strictEqual(vscode.workspace.getConfiguration('msgram').get('productName'), 'measuresoftgram');

        assert.ok(!cmds(posted).includes('not_configured'), 'configurado: não emite not_configured');
        assert.ok(cmds(posted).includes('score_loading'), 'tentou carregar');
        const err = find(posted, 'score_error');
        assert.ok(err, `esperava score_error; veio ${cmds(posted).join(',')}`);
        // Com rede: a API oficial responde 401 → 'auth'. Sem rede / API fora: 'unavailable' ou 'timeout'.
        assert.ok(['auth', 'unavailable', 'timeout'].includes(err!.kind), `kind inesperado: ${err!.kind} (${err!.message})`);
        assert.ok(!cmds(posted).includes('score_loaded'), 'nenhum score inventado com token inválido');
        assert.strictEqual(api.sidebar.loadState, 'error');
    });

    test('§4 serviço travado: score_error kind timeout dentro do tempo configurado', async function () {
        this.timeout(45_000);
        // Porta que não responde (RFC 5737, inalcançável) com timeout curto.
        await vscode.workspace.getConfiguration('msgram').update('requestTimeoutMs', 3000, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('msgram').update('serviceUrl', 'https://192.0.2.1', vscode.ConfigurationTarget.Global);
        const {posted, done} = collect(api, ['score_error', 'score_loaded'], 30_000);
        const t0 = Date.now();
        await api.sidebar.handleMessage({command: 'retry'});
        await done;
        const elapsed = Date.now() - t0;

        const err = find(posted, 'score_error');
        assert.ok(err, cmds(posted).join(','));
        assert.ok(['timeout', 'unavailable'].includes(err!.kind), err!.kind);
        assert.ok(elapsed < 15_000, `erro apareceu em ${elapsed} ms`);

        await vscode.workspace.getConfiguration('msgram').update('serviceUrl', REAL_API, vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('msgram').update('requestTimeoutMs', 15000, vscode.ConfigurationTarget.Global);
    });

    test('§5 request_yaml sem workspace responde exists:false sem lançar', async function () {
        this.timeout(10_000);
        const {posted, done} = collect(api, ['yaml_loaded'], 5_000);
        await api.sidebar.handleMessage({command: 'request_yaml'});
        await done;
        const y = find(posted, 'yaml_loaded');
        assert.ok(y);
        assert.strictEqual(y!.exists, false);
    });

    test('§7 run_action: sem workspace bloqueia; com Docker parado bloqueia por docker_stopped/missing', async function () {
        this.timeout(30_000);
        // Sem pasta aberta no host de teste → no_workspace, e nada é executado.
        const {posted, done} = collect(api, ['analysis_blocked', 'analysis_started'], 20_000);
        await api.sidebar.handleMessage({command: 'run_action', yaml: 'name: teste'});
        await done;
        const b = find(posted, 'analysis_blocked');
        assert.ok(b, cmds(posted).join(','));
        assert.ok(['no_workspace', 'docker_missing', 'docker_stopped'].includes(b!.reason), b!.reason);
        assert.ok(!cmds(posted).includes('analysis_started'));
        assert.strictEqual(api.sidebar.actionState, 'idle');
    });

    test('§2 clear_secret volta para not_configured', async function () {
        this.timeout(20_000);
        const {posted, done} = collect(api, ['not_configured', 'score_error', 'score_loaded'], 15_000);
        await api.sidebar.handleMessage({command: 'clear_secret', key: 'msgram.token'});
        await done;
        assert.ok(cmds(posted).includes('not_configured'), cmds(posted).join(','));
        const settings = find(posted, 'settings_loaded');
        assert.strictEqual(settings!.data.hasMsgramToken, false);
        assert.strictEqual(api.sidebar.loadState, 'not_configured');
    });

    suiteTeardown(async function () {
        this.timeout(20_000);
        await api.sidebar.handleMessage({command: 'clear_secret', key: 'msgram.githubToken'});
        await vscode.workspace.getConfiguration('msgram').update('productName', '', vscode.ConfigurationTarget.Global);
        await vscode.workspace.getConfiguration('msgram').update('sonarProjectKey', '', vscode.ConfigurationTarget.Global);
    });
});
