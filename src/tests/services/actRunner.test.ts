import * as assert from 'assert';
import {EventEmitter} from 'node:events';
import {ActRunner, ActRunnerDeps} from '../../services/actRunner';

// ── Fake de child_process.spawn ───────────────────────────────────────────

class FakeChild extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    pid = 4242;
    killed = false;
    signals: string[] = [];

    kill(signal?: string) {
        this.killed = true;
        this.signals.push(signal ?? 'SIGTERM');
        return true;
    }
}

interface SpawnCall {
    cmd: string;
    args: string[];
    opts: any;
    child: FakeChild;
}

function makeDeps() {
    const calls: SpawnCall[] = [];
    const deps: ActRunnerDeps = {
        spawn: ((cmd: string, args: string[], opts: any) => {
            const child = new FakeChild();
            calls.push({cmd, args, opts, child});
            return child as any;
        }) as any,
    };
    return {deps, calls};
}

function tick() {
    return new Promise((r) => setImmediate(r));
}

const RUN_OPTS = {
    workspacePath: '/ws',
    workflowRelPath: '.github/workflows/msgram.yml',
    dockerDir: '/ext/resources/docker',
    githubToken: 'ghp_segredo123',
    msgramToken: 'tok_segredo456',
};

// ── checkDocker ───────────────────────────────────────────────────────────

suite('ActRunner.checkDocker', () => {
    test('ok quando docker info responde a versão', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const p = runner.checkDocker();
        await tick();
        assert.strictEqual(calls[0].cmd, 'docker');
        assert.deepStrictEqual(calls[0].args, ['info', '--format', '{{.ServerVersion}}']);
        calls[0].child.stdout.emit('data', Buffer.from('29.6.2\n'));
        calls[0].child.emit('close', 0);
        const r = await p;
        assert.deepStrictEqual(r, {ok: true, version: '29.6.2'});
    });

    test('docker_missing quando o binário não existe (ENOENT)', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const p = runner.checkDocker();
        await tick();
        calls[0].child.emit('error', Object.assign(new Error('spawn docker ENOENT'), {code: 'ENOENT'}));
        const r = await p;
        assert.strictEqual(r.ok, false);
        assert.strictEqual((r as any).reason, 'docker_missing');
    });

    test('docker_stopped quando o daemon não responde (código ≠ 0)', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const p = runner.checkDocker();
        await tick();
        calls[0].child.stderr.emit('data', Buffer.from('failed to connect to the docker API'));
        calls[0].child.emit('close', 1);
        const r = await p;
        assert.strictEqual(r.ok, false);
        assert.strictEqual((r as any).reason, 'docker_stopped');
        assert.ok((r as any).detail.includes('failed to connect'));
    });

    test('docker_stopped por timeout', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const r = await runner.checkDocker(20);
        assert.strictEqual(r.ok, false);
        assert.strictEqual((r as any).reason, 'docker_stopped');
        assert.ok(calls[0].child.killed, 'mata o processo pendurado');
    });
});

// ── run ───────────────────────────────────────────────────────────────────

suite('ActRunner.run', () => {
    test('spawna docker compose run com evento, workflow e secrets por ambiente', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const lines: { line: string; isError: boolean }[] = [];
        let done: any = null;

        const started = runner.run({...RUN_OPTS, onLine: (line, isError) => lines.push({line, isError}), onDone: (r) => (done = r)});
        assert.strictEqual(started, true);
        assert.strictEqual(runner.isRunning, true);

        const call = calls[0];
        assert.strictEqual(call.cmd, 'docker');
        assert.deepStrictEqual(call.args, [
            'compose', 'run', '--rm', '--build', 'act-runner',
            'workflow_dispatch', '-W', '/workspace/.github/workflows/msgram.yml',
            '-s', 'GITHUB_TOKEN', '-s', 'MSGRAM_TOKEN',
        ]);
        assert.strictEqual(call.opts.cwd, '/ext/resources/docker');
        assert.strictEqual(call.opts.env.WORKSPACE_PATH, '/ws');
        assert.strictEqual(call.opts.env.GITHUB_TOKEN, 'ghp_segredo123');
        assert.strictEqual(call.opts.env.MSGRAM_TOKEN, 'tok_segredo456');
        assert.ok(!call.args.join(' ').includes('segredo'), 'tokens não vão nos argumentos');

        call.child.stdout.emit('data', Buffer.from('[msgram_job] linha 1\n[msgram_job] linha 2\n'));
        call.child.stderr.emit('data', Buffer.from('aviso\n'));
        call.child.emit('close', 0);
        await tick();

        assert.deepStrictEqual(lines.map((l) => l.line), ['[msgram_job] linha 1', '[msgram_job] linha 2', 'aviso']);
        assert.deepStrictEqual(lines.map((l) => l.isError), [false, false, true]);
        assert.deepStrictEqual(done, {success: true, exitCode: 0});
        assert.strictEqual(runner.isRunning, false);
    });

    test('mascara os tokens em qualquer linha de saída', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const lines: string[] = [];
        runner.run({...RUN_OPTS, onLine: (l) => lines.push(l), onDone: () => {}});
        calls[0].child.stdout.emit('data', Buffer.from('Authorization: Token tok_segredo456 e ghp_segredo123 aqui\n'));
        calls[0].child.emit('close', 0);
        await tick();
        assert.strictEqual(lines[0], 'Authorization: Token *** e *** aqui');
    });

    test('junta pedaços de linha entre chunks', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const lines: string[] = [];
        runner.run({...RUN_OPTS, onLine: (l) => lines.push(l), onDone: () => {}});
        calls[0].child.stdout.emit('data', Buffer.from('meta'));
        calls[0].child.stdout.emit('data', Buffer.from('de\nfinal sem quebra'));
        calls[0].child.emit('close', 0);
        await tick();
        assert.deepStrictEqual(lines, ['metade', 'final sem quebra']);
    });

    test('código de saída ≠ 0 vira success:false', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        let done: any = null;
        runner.run({...RUN_OPTS, onLine: () => {}, onDone: (r) => (done = r)});
        calls[0].child.emit('close', 3);
        await tick();
        assert.deepStrictEqual(done, {success: false, exitCode: 3});
    });

    test('erro ao spawnar reporta linha de erro e done com exitCode -1', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        const lines: { line: string; isError: boolean }[] = [];
        let done: any = null;
        runner.run({...RUN_OPTS, onLine: (line, isError) => lines.push({line, isError}), onDone: (r) => (done = r)});
        calls[0].child.emit('error', new Error('spawn docker ENOENT'));
        await tick();
        assert.ok(lines.some((l) => l.isError && l.line.includes('ENOENT')));
        assert.deepStrictEqual(done, {success: false, exitCode: -1});
        assert.strictEqual(runner.isRunning, false);
    });

    test('segunda run enquanto roda devolve false e não spawna de novo', () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        runner.run({...RUN_OPTS, onLine: () => {}, onDone: () => {}});
        const again = runner.run({...RUN_OPTS, onLine: () => {}, onDone: () => {}});
        assert.strictEqual(again, false);
        assert.strictEqual(calls.length, 1);
    });
});

// ── stop ──────────────────────────────────────────────────────────────────

suite('ActRunner.stop', () => {
    test('envia SIGTERM, roda compose down e marca como parado', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        let done: any = null;
        runner.run({...RUN_OPTS, onLine: () => {}, onDone: (r) => (done = r)});

        const stopping = runner.stop();
        await tick();
        assert.ok(calls[0].child.signals.includes('SIGTERM'));
        assert.strictEqual(runner.isStopping, true);
        // compose down
        const down = calls.find((c) => c.args[0] === 'compose' && c.args[1] === 'down');
        assert.ok(down, 'docker compose down foi chamado');
        assert.ok(down!.args.includes('--remove-orphans'));
        down!.child.emit('close', 0);
        calls[0].child.emit('close', 143);
        await stopping;
        await tick();
        assert.deepStrictEqual(done, {success: false, exitCode: 143, stopped: true});
        assert.strictEqual(runner.isRunning, false);
    });

    test('stop sem execução em andamento não faz nada', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        await runner.stop();
        assert.strictEqual(calls.length, 0);
    });

    test('dispose para a execução', async () => {
        const {deps, calls} = makeDeps();
        const runner = new ActRunner(deps);
        runner.run({...RUN_OPTS, onLine: () => {}, onDone: () => {}});
        runner.dispose();
        await tick();
        assert.ok(calls[0].child.killed);
    });
});
