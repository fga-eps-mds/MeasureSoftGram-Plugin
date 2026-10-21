import * as assert from 'assert';
import {resolveRepoContext} from '../../services/repoResolver';
import {HttpError} from '../../services/httpClient';

const ORGS = [{id: 1, name: 'EPS/MDS'}, {id: 2, name: 'Luiza Maluf'}];
const CFG = {orgPk: 1, orgName: 'EPS/MDS', organizations: ORGS, productPk: 10, productName: 'Measure', repos: [{id: 100, name: 'Service'}, {id: 101, name: 'MeasureSoftGram-Plugin'}]};
const FOUND = {orgPk: 2, orgName: 'Luiza Maluf', organizations: ORGS, productPk: 20, productName: 'Integracao', repos: [{id: 200, name: 'Integracao-de-Dados'}], repo: {id: 200, name: 'Integracao-de-Dados'}};

const settings = (productName: string) => ({serviceUrl: 'https://s', token: 't', productName});

suite('repoResolver', () => {
    test('pasta aberta está no produto configurado → seleciona sem descobrir', async () => {
        let discovered = 0;
        const r = await resolveRepoContext(settings('Measure'), {remoteName: '2026.1-MeasureSoftGram-Plugin'}, null, {
            fetchRepositories: async () => CFG,
            discoverRepository: async () => { discovered++; return FOUND; },
        });
        assert.strictEqual(r.kind, 'ok');
        if (r.kind === 'ok') {
            assert.strictEqual(r.selectedRepo.id, 101);
            assert.strictEqual(r.detected, true);
            assert.strictEqual(r.switched, undefined);
        }
        assert.strictEqual(discovered, 0);
    });

    test('pasta aberta não está no produto configurado → descobre em outro produto e persiste', async () => {
        const persisted: any[] = [];
        const r = await resolveRepoContext(settings('Measure'), {remoteName: 'Integracao-de-Dados'}, null, {
            fetchRepositories: async () => CFG,
            discoverRepository: async () => FOUND,
            persist: async (p) => { persisted.push(p); },
        });
        assert.strictEqual(r.kind, 'ok');
        if (r.kind === 'ok') {
            assert.strictEqual(r.selectedRepo.id, 200);
            assert.strictEqual(r.context.productName, 'Integracao');
            assert.deepStrictEqual(r.switched, {productName: 'Integracao', orgName: 'Luiza Maluf'});
        }
        assert.deepStrictEqual(persisted, [{productName: 'Integracao', organizationName: 'Luiza Maluf'}]);
    });

    test('sem produto configurado → descobre direto', async () => {
        let fetched = 0;
        const r = await resolveRepoContext(settings(''), {folderName: 'Integracao-de-Dados'}, null, {
            fetchRepositories: async () => { fetched++; return CFG; },
            discoverRepository: async () => FOUND,
            persist: async () => {},
        });
        assert.strictEqual(fetched, 0);
        assert.strictEqual(r.kind, 'ok');
        if (r.kind === 'ok') { assert.ok(r.switched); }
    });

    test('sem produto e sem casamento em lugar nenhum → missingProduct', async () => {
        const r = await resolveRepoContext(settings(''), {folderName: 'outro'}, null, {
            discoverRepository: async () => null,
        });
        assert.strictEqual(r.kind, 'missingProduct');
    });

    test('produto configurado sem casamento e sem descoberta → primeiro repositório, sem persistir', async () => {
        const persisted: any[] = [];
        const r = await resolveRepoContext(settings('Measure'), {folderName: 'outro'}, null, {
            fetchRepositories: async () => CFG,
            discoverRepository: async () => null,
            persist: async (p) => { persisted.push(p); },
        });
        assert.strictEqual(r.kind, 'ok');
        if (r.kind === 'ok') { assert.strictEqual(r.selectedRepo.id, 100); assert.strictEqual(r.detected, false); }
        assert.deepStrictEqual(persisted, []);
    });

    test('mantém o repositório escolhido pela pessoa ao recarregar', async () => {
        const r = await resolveRepoContext(settings('Measure'), {remoteName: 'MeasureSoftGram-Plugin'}, 100, {
            fetchRepositories: async () => CFG,
            discoverRepository: async () => { throw new Error('não deveria descobrir'); },
        });
        assert.strictEqual(r.kind, 'ok');
        if (r.kind === 'ok') { assert.strictEqual(r.selectedRepo.id, 100); assert.strictEqual(r.detected, false); }
    });

    test('produto configurado não existe mais → descobre; sem descoberta relança o not_found', async () => {
        const nf = new HttpError('Produto "X" não encontrado', 'not_found', 404);
        const ok = await resolveRepoContext(settings('X'), {remoteName: 'Integracao-de-Dados'}, null, {
            fetchRepositories: async () => { throw nf; },
            discoverRepository: async () => FOUND,
            persist: async () => {},
        });
        assert.strictEqual(ok.kind, 'ok');
        await assert.rejects(
            resolveRepoContext(settings('X'), {remoteName: 'nada'}, null, {
                fetchRepositories: async () => { throw nf; },
                discoverRepository: async () => null,
            }),
            (e: unknown) => e === nf,
        );
    });

    test('sem pistas da pasta aberta nunca descobre', async () => {
        let discovered = 0;
        const r = await resolveRepoContext(settings('Measure'), {}, null, {
            fetchRepositories: async () => CFG,
            discoverRepository: async () => { discovered++; return FOUND; },
        });
        assert.strictEqual(r.kind, 'ok');
        assert.strictEqual(discovered, 0);
    });

    test('produto vazio e sem repositórios → empty', async () => {
        const r = await resolveRepoContext(settings('Measure'), {}, null, {
            fetchRepositories: async () => ({...CFG, repos: []}),
        });
        assert.strictEqual(r.kind, 'empty');
    });
});
