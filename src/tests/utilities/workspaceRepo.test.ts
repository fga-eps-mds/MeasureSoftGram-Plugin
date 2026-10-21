import * as assert from 'assert';
import {detectWorkspaceHints, httpsUrlFromRemote, pickMatchingRepo, repoNameFromRemote} from '../../utilities/workspaceRepo';

suite('workspaceRepo — repoNameFromRemote', () => {
    test('extrai o nome de remotes ssh e https, com ou sem .git', () => {
        assert.strictEqual(repoNameFromRemote('git@github.com:fga-eps-mds/2026.1-MeasureSoftGram-Plugin.git'), '2026.1-MeasureSoftGram-Plugin');
        assert.strictEqual(repoNameFromRemote('https://github.com/fga-eps-mds/MeasureSoftGram-Service.git\n'), 'MeasureSoftGram-Service');
        assert.strictEqual(repoNameFromRemote('https://github.com/org/Repo/'), 'Repo');
        assert.strictEqual(repoNameFromRemote(''), undefined);
    });
});

suite('workspaceRepo — httpsUrlFromRemote', () => {
    test('converte ssh e https para a URL https sem .git', () => {
        assert.strictEqual(httpsUrlFromRemote('git@github.com:org/Repo.git'), 'https://github.com/org/Repo');
        assert.strictEqual(httpsUrlFromRemote('https://github.com/org/Repo.git\n'), 'https://github.com/org/Repo');
        assert.strictEqual(httpsUrlFromRemote('ssh://git@gitlab.com/g/p.git'), 'https://gitlab.com/g/p');
        assert.strictEqual(httpsUrlFromRemote(''), undefined);
    });
});

suite('workspaceRepo — detectWorkspaceHints', () => {
    test('usa o remote origin e o nome da pasta', async () => {
        const hints = await detectWorkspaceHints('/home/x/2026.1-MeasureSoftGram-Plugin', {
            execFile: async (cmd, args, opts) => {
                assert.strictEqual(cmd, 'git');
                assert.deepStrictEqual(args, ['config', '--get', 'remote.origin.url']);
                assert.strictEqual(opts.cwd, '/home/x/2026.1-MeasureSoftGram-Plugin');
                return {stdout: 'git@github.com:org/Plugin-Remote.git\n'};
            },
        });
        assert.deepStrictEqual(hints, {folderName: '2026.1-MeasureSoftGram-Plugin', remoteName: 'Plugin-Remote', remoteUrl: 'https://github.com/org/Plugin-Remote'});
    });

    test('sem git fica só com o nome da pasta', async () => {
        const hints = await detectWorkspaceHints('/tmp/minha-pasta', {execFile: async () => { throw new Error('not a git repo'); }});
        assert.deepStrictEqual(hints, {folderName: 'minha-pasta'});
    });
});

suite('workspaceRepo — pickMatchingRepo', () => {
    const repos = [
        {id: 1, name: 'MeasureSoftGram-Service'},
        {id: 2, name: 'MeasureSoftGram-Plugin'},
        {id: 3, name: '2026.1-MeasureSoftGram-Front'},
    ];

    test('igualdade exata ignorando maiúsculas pelo remote', () => {
        assert.strictEqual(pickMatchingRepo(repos, {remoteName: 'measuresoftgram-plugin'})?.id, 2);
    });

    test('remote tem prioridade sobre o nome da pasta', () => {
        assert.strictEqual(pickMatchingRepo(repos, {remoteName: 'MeasureSoftGram-Service', folderName: 'MeasureSoftGram-Plugin'})?.id, 1);
    });

    test('casa por sufixo quando o remote tem prefixo de semestre', () => {
        assert.strictEqual(pickMatchingRepo(repos, {remoteName: '2026.1-MeasureSoftGram-Plugin'})?.id, 2);
    });

    test('casa por sufixo no sentido inverso (serviço com prefixo, pasta sem)', () => {
        assert.strictEqual(pickMatchingRepo(repos, {folderName: 'MeasureSoftGram-Front'})?.id, 3);
    });

    test('não casa "Plugin" com "MeasureSoftGram-Plugin" sem separador', () => {
        assert.strictEqual(pickMatchingRepo(repos, {folderName: 'SoftGram-Plugin'}), undefined);
    });

    test('sem pistas ou sem repositórios devolve undefined', () => {
        assert.strictEqual(pickMatchingRepo(repos, {}), undefined);
        assert.strictEqual(pickMatchingRepo([], {remoteName: 'x'}), undefined);
        assert.strictEqual(pickMatchingRepo(repos, {remoteName: 'outro-projeto'}), undefined);
    });
});
