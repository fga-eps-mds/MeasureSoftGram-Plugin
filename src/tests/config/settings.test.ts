import * as assert from 'assert';
import {
    clearSecret,
    isConfigured,
    loadSettings,
    loadSettingsForUi,
    normalizeBaseUrl,
    normalizeToken,
    saveSettings,
    SECRET_GITHUB_TOKEN,
    SECRET_MSGRAM_TOKEN,
    SettingsDeps,
} from '../../config/settings';

// ── Fakes ──────────────────────────────────────────────────────────────────

function makeConfig(initial: Record<string, unknown> = {}) {
    const store: Record<string, unknown> = {...initial};
    const updates: { key: string; value: unknown; target: unknown }[] = [];
    const defaults: Record<string, unknown> = {
        serviceUrl: 'https://msgram.lappis.rocks',
        productName: '',
        organizationName: '',
        sonarProjectKey: '',
        workflowName: 'Build',
        requestTimeoutMs: 15000,
        grafanaAllowedHosts: [],
    };
    return {
        updates,
        get<T>(key: string, def?: T): T {
            return (store[key] ?? defaults[key] ?? def) as T;
        },
        async update(key: string, value: unknown, target?: unknown) {
            store[key] = value;
            updates.push({key, value, target});
        },
    };
}

function makeSecrets(initial: Record<string, string> = {}) {
    const store: Record<string, string> = {...initial};
    const deleted: string[] = [];
    return {
        store_: store,
        deleted,
        async get(k: string) { return store[k]; },
        async store(k: string, v: string) { store[k] = v; },
        async delete(k: string) { delete store[k]; deleted.push(k); },
    };
}

function makeDeps(opts: {
    config?: Record<string, unknown>;
    secrets?: Record<string, string>;
    hasWorkspace?: boolean;
} = {}): SettingsDeps & { config: ReturnType<typeof makeConfig>; secrets: ReturnType<typeof makeSecrets> } {
    const config = makeConfig(opts.config);
    const secrets = makeSecrets(opts.secrets);
    return {
        config,
        secrets,
        getConfiguration: () => config as any,
        hasWorkspaceFolder: () => opts.hasWorkspace ?? true,
        ConfigurationTarget: {Global: 1, Workspace: 2},
    };
}

// ── normalizeBaseUrl ───────────────────────────────────────────────────────

suite('config/settings — normalizeBaseUrl', () => {
    test('remove espaços e barras finais', () => {
        assert.strictEqual(normalizeBaseUrl('  https://a.com///  '), 'https://a.com');
    });

    test('adiciona https:// quando não há esquema', () => {
        assert.strictEqual(normalizeBaseUrl('msgram.lappis.rocks'), 'https://msgram.lappis.rocks');
    });

    test('mantém http:// para localhost', () => {
        assert.strictEqual(normalizeBaseUrl('http://localhost:8000/'), 'http://localhost:8000');
        assert.strictEqual(normalizeBaseUrl('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
    });

    test('troca http:// por https:// para hosts remotos', () => {
        assert.strictEqual(normalizeBaseUrl('http://msgram.lappis.rocks'), 'https://msgram.lappis.rocks');
    });

    test('string vazia continua vazia', () => {
        assert.strictEqual(normalizeBaseUrl('   '), '');
    });
});

// ── loadSettings ───────────────────────────────────────────────────────────

suite('config/settings — loadSettings', () => {
    test('usa os padrões quando nada foi configurado', async () => {
        const s = await loadSettings(makeDeps());
        assert.strictEqual(s.serviceUrl, 'https://msgram.lappis.rocks');
        assert.strictEqual(s.productName, '');
        assert.strictEqual(s.workflowName, 'Build');
        assert.strictEqual(s.requestTimeoutMs, 15000);
        assert.deepStrictEqual(s.grafanaAllowedHosts, []);
        assert.strictEqual(s.token, '');
        assert.strictEqual(s.githubToken, '');
    });

    test('lê configuração e segredos', async () => {
        const deps = makeDeps({
            config: {serviceUrl: 'https://custom.com/', productName: 'Prod'},
            secrets: {[SECRET_MSGRAM_TOKEN]: 'tok', [SECRET_GITHUB_TOKEN]: 'ghp'},
        });
        const s = await loadSettings(deps);
        assert.strictEqual(s.serviceUrl, 'https://custom.com');
        assert.strictEqual(s.productName, 'Prod');
        assert.strictEqual(s.token, 'tok');
        assert.strictEqual(s.githubToken, 'ghp');
    });

    test('limita requestTimeoutMs ao intervalo 1000–60000', async () => {
        assert.strictEqual((await loadSettings(makeDeps({config: {requestTimeoutMs: 10}}))).requestTimeoutMs, 1000);
        assert.strictEqual((await loadSettings(makeDeps({config: {requestTimeoutMs: 999999}}))).requestTimeoutMs, 60000);
    });
});

// ── loadSettingsForUi ──────────────────────────────────────────────────────

suite('config/settings — loadSettingsForUi', () => {
    test('nunca inclui o valor dos tokens, só as flags', async () => {
        const deps = makeDeps({secrets: {[SECRET_MSGRAM_TOKEN]: 'tok'}});
        const ui = await loadSettingsForUi(deps);
        assert.strictEqual(ui.hasMsgramToken, true);
        assert.strictEqual(ui.hasGithubToken, false);
        assert.ok(!('token' in ui));
        assert.ok(!('githubToken' in ui));
        assert.ok(!JSON.stringify(ui).includes('tok'));
    });
});

// ── saveSettings ───────────────────────────────────────────────────────────

suite('config/settings — saveSettings', () => {
    const payload = {
        serviceUrl: 'https://new.com/',
        productName: 'P',
        organizationName: 'O',
        sonarProjectKey: 'S',
        workflowName: 'W',
        requestTimeoutMs: 20000,
        grafanaAllowedHosts: ['g.com'],
    };

    test('grava os campos não sensíveis na configuração com escopo Workspace', async () => {
        const deps = makeDeps({hasWorkspace: true});
        await saveSettings({...payload, msgramServiceToken: 'tok', githubToken: 'ghp'}, deps);
        const keys = deps.config.updates.map(u => u.key).sort();
        assert.deepStrictEqual(keys, ['grafanaAllowedHosts', 'organizationName', 'productName', 'requestTimeoutMs', 'serviceUrl', 'sonarProjectKey', 'workflowName']);
        assert.ok(deps.config.updates.every(u => u.target === 2), 'todos com target Workspace');
        assert.strictEqual(deps.config.get('serviceUrl'), 'https://new.com', 'URL normalizada antes de gravar');
    });

    test('usa escopo Global quando não há pasta aberta', async () => {
        const deps = makeDeps({hasWorkspace: false});
        await saveSettings(payload, deps);
        assert.ok(deps.config.updates.every(u => u.target === 1));
    });

    test('grava os dois tokens em secrets', async () => {
        const deps = makeDeps();
        await saveSettings({...payload, msgramServiceToken: 'tok', githubToken: 'ghp'}, deps);
        assert.strictEqual(deps.secrets.store_[SECRET_MSGRAM_TOKEN], 'tok');
        assert.strictEqual(deps.secrets.store_[SECRET_GITHUB_TOKEN], 'ghp');
    });

    test('token vazio ou ausente mantém o valor existente', async () => {
        const deps = makeDeps({secrets: {[SECRET_MSGRAM_TOKEN]: 'old', [SECRET_GITHUB_TOKEN]: 'oldgh'}});
        await saveSettings({...payload, msgramServiceToken: '', githubToken: undefined}, deps);
        assert.strictEqual(deps.secrets.store_[SECRET_MSGRAM_TOKEN], 'old');
        assert.strictEqual(deps.secrets.store_[SECRET_GITHUB_TOKEN], 'oldgh');
    });

    test('remove o prefixo "Token " que o site do MeasureSoftGram mostra', async () => {
        const deps = makeDeps();
        await saveSettings({...payload, msgramServiceToken: '  Token 6620fdcea5059  ', githubToken: 'Bearer ghp_x'}, deps);
        assert.strictEqual(deps.secrets.store_[SECRET_MSGRAM_TOKEN], '6620fdcea5059');
        assert.strictEqual(deps.secrets.store_[SECRET_GITHUB_TOKEN], 'ghp_x');
    });

    test('normalizeToken mantém tokens sem prefixo e trata vazio', () => {
        assert.strictEqual(normalizeToken('abc'), 'abc');
        assert.strictEqual(normalizeToken('token ABC'), 'ABC');
        assert.strictEqual(normalizeToken('   '), '');
        assert.strictEqual(normalizeToken(undefined), '');
    });

    test('nunca grava token na configuração', async () => {
        const deps = makeDeps();
        await saveSettings({...payload, msgramServiceToken: 'tok', githubToken: 'ghp'}, deps);
        const dumped = JSON.stringify(deps.config.updates);
        assert.ok(!dumped.includes('tok'));
        assert.ok(!dumped.includes('ghp'));
    });
});

// ── clearSecret / isConfigured ─────────────────────────────────────────────

suite('config/settings — clearSecret e isConfigured', () => {
    test('clearSecret apaga só a chave pedida', async () => {
        const deps = makeDeps({secrets: {[SECRET_MSGRAM_TOKEN]: 'a', [SECRET_GITHUB_TOKEN]: 'b'}});
        await clearSecret(SECRET_MSGRAM_TOKEN, deps);
        assert.deepStrictEqual(deps.secrets.deleted, [SECRET_MSGRAM_TOKEN]);
        assert.strictEqual(deps.secrets.store_[SECRET_GITHUB_TOKEN], 'b');
    });

    test('isConfigured lista o que falta', () => {
        assert.deepStrictEqual(
            isConfigured({serviceUrl: '', productName: '', token: ''} as any),
            ['token', 'serviceUrl', 'productName'],
        );
        assert.deepStrictEqual(
            isConfigured({serviceUrl: 'https://a', productName: 'P', token: 't'} as any),
            [],
        );
        assert.deepStrictEqual(
            isConfigured({serviceUrl: 'https://a', productName: '  ', token: 't'} as any),
            ['productName'],
        );
    });
});
