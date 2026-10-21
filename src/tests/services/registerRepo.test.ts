import * as assert from 'assert';
import {registerWorkspaceRepo, RegisterUi} from '../../services/registerRepo';

const settings = {serviceUrl: 'https://s', token: 't', productName: ''};

function makeUi(script: {
    picks?: (string | undefined)[];
    inputs?: (string | undefined)[];
    confirm?: boolean;
} = {}) {
    const picks = [...(script.picks ?? [])];
    const inputs = [...(script.inputs ?? [])];
    const messages: string[] = [];
    const ui: RegisterUi = {
        async pick(items) {
            const want = picks.shift();
            if (want === undefined) { return undefined; }
            return items.find((i) => i.label === want || i.label.includes(want));
        },
        async input(_prompt, value) {
            const v = inputs.shift();
            return v === undefined ? value : v;
        },
        async confirm() { return script.confirm ?? true; },
        info(m) { messages.push('info:' + m); },
        warn(m) { messages.push('warn:' + m); },
    };
    return {ui, messages};
}

function makeDeps(ui: RegisterUi, over: Partial<Parameters<typeof registerWorkspaceRepo>[2]> = {}) {
    const created: any[] = [];
    const persisted: any[] = [];
    const deps = {
        ui,
        listOrganizations: async () => [{id: 1, name: 'EPS/MDS'}, {id: 2, name: 'Luiza Maluf'}],
        listProducts: async (_s: any, orgPk: number) => (orgPk === 2 ? [{id: 20, name: 'Integracao'}] : [{id: 10, name: 'Measure'}]),
        createProduct: async (_s: any, orgPk: number, data: any) => { created.push({product: data, orgPk}); return {id: 99, name: data.name}; },
        createRepository: async (_s: any, orgPk: number, productPk: number, data: any) => { created.push({repo: data, orgPk, productPk}); return {id: 500, name: data.name}; },
        persist: async (p: any) => { persisted.push(p); },
        ...over,
    };
    return {deps, created, persisted};
}

suite('registerWorkspaceRepo', () => {
    test('escolhe organização e produto existentes, cria o repositório e persiste', async () => {
        const {ui, messages} = makeUi({picks: ['Luiza Maluf', 'Integracao']});
        const {deps, created, persisted} = makeDeps(ui);

        const r = await registerWorkspaceRepo(settings, {remoteName: 'meu-repo', remoteUrl: 'https://github.com/x/meu-repo'}, deps as any);

        assert.strictEqual(r.kind, 'registered');
        assert.deepStrictEqual(created, [{repo: {name: 'meu-repo', url: 'https://github.com/x/meu-repo', description: 'Cadastrado pela extensão do VS Code a partir de https://github.com/x/meu-repo', platform: 'github'}, orgPk: 2, productPk: 20}]);
        assert.deepStrictEqual(persisted, [{productName: 'Integracao', organizationName: 'Luiza Maluf'}]);
        assert.ok(messages.some((m) => m.startsWith('info:') && m.includes('meu-repo')));
    });

    test('"criar um produto novo" cria o produto com o nome sugerido e depois o repositório', async () => {
        const {ui} = makeUi({picks: ['EPS/MDS', 'Criar um produto novo'], inputs: [undefined]});
        const {deps, created, persisted} = makeDeps(ui);

        const r = await registerWorkspaceRepo(settings, {folderName: 'projeto-x'}, deps as any);

        assert.strictEqual(r.kind, 'registered');
        assert.strictEqual(created[0].product.name, 'projeto-x', 'nome da pasta sugerido como nome do produto');
        assert.strictEqual(created[1].productPk, 99);
        assert.deepStrictEqual(persisted, [{productName: 'projeto-x', organizationName: 'EPS/MDS'}]);
    });

    test('uma organização só: não pergunta a organização', async () => {
        const {ui} = makeUi({picks: ['Measure']});
        const {deps, created} = makeDeps(ui, {listOrganizations: async () => [{id: 1, name: 'EPS/MDS'}]});
        const r = await registerWorkspaceRepo(settings, {remoteName: 'r'}, deps as any);
        assert.strictEqual(r.kind, 'registered');
        assert.strictEqual(created[0].orgPk, 1);
    });

    test('cancelar no Quick Pick ou na confirmação não cria nada', async () => {
        const a = makeUi({picks: [undefined]});
        const da = makeDeps(a.ui);
        assert.strictEqual((await registerWorkspaceRepo(settings, {remoteName: 'r'}, da.deps as any)).kind, 'cancelled');
        assert.deepStrictEqual(da.created, []);

        const b = makeUi({picks: ['EPS/MDS', 'Measure'], confirm: false});
        const db = makeDeps(b.ui);
        assert.strictEqual((await registerWorkspaceRepo(settings, {remoteName: 'r'}, db.deps as any)).kind, 'cancelled');
        assert.deepStrictEqual(db.created, []);
        assert.deepStrictEqual(db.persisted, []);
    });

    test('sem pista da pasta aberta avisa e não chama a API', async () => {
        const {ui, messages} = makeUi();
        const {deps, created} = makeDeps(ui);
        const r = await registerWorkspaceRepo(settings, {}, deps as any);
        assert.strictEqual(r.kind, 'no_hints');
        assert.deepStrictEqual(created, []);
        assert.ok(messages[0].startsWith('warn:'));
    });

    test('erro da API ao criar o repositório sobe para quem chamou', async () => {
        const {ui} = makeUi({picks: ['EPS/MDS', 'Measure']});
        const {deps, persisted} = makeDeps(ui, {createRepository: async () => { throw new Error('HTTP 400: já existe'); }});
        await assert.rejects(registerWorkspaceRepo(settings, {remoteName: 'r'}, deps as any), /já existe/);
        assert.deepStrictEqual(persisted, []);
    });
});
