/**
 * Execução local da MeasureSoftGram Action com o `act` dentro de Docker.
 *
 * - Pré-checagem: `docker info` (binário ausente → docker_missing; daemon
 *   parado ou timeout → docker_stopped).
 * - Execução: `docker compose run --rm --build act-runner workflow_dispatch
 *   -W <workflow> -s GITHUB_TOKEN -s MSGRAM_TOKEN`. Os tokens vão só pelo
 *   ambiente do processo filho; `-s NOME` sem valor faz o act ler da env.
 *   Nada é escrito em disco e os valores são mascarados na saída.
 * - Cancelamento: SIGTERM no processo + `docker compose down`.
 *
 * Uma execução por vez. Instância compartilhada entre painel e barra lateral
 * via `sharedActRunner()`.
 */
import {ChildProcess, spawn as nodeSpawn, SpawnOptions} from 'node:child_process';

export interface ActRunnerDeps {
    spawn: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
}

export type DockerCheck =
    | { ok: true; version: string }
    | { ok: false; reason: 'docker_missing' | 'docker_stopped'; detail: string };

export interface RunResult {
    success: boolean;
    exitCode: number;
    /** true quando terminou por stop() */
    stopped?: boolean;
}

export interface RunOptions {
    workspacePath: string;
    workflowRelPath: string;
    /** pasta com compose.yml e Dockerfile */
    dockerDir: string;
    githubToken: string;
    msgramToken: string;
    onLine: (line: string, isError: boolean) => void;
    onDone: (result: RunResult) => void;
}

export const DOCKER_INSTALL_URL = 'https://docs.docker.com/get-docker/';
const DEFAULT_CHECK_TIMEOUT_MS = 5_000;

export class ActRunner {
    private _child: ChildProcess | null = null;
    private _dockerDir: string | undefined;
    private _stopping = false;
    private readonly _deps: ActRunnerDeps;

    constructor(deps?: Partial<ActRunnerDeps>) {
        this._deps = {spawn: deps?.spawn ?? (nodeSpawn as ActRunnerDeps['spawn'])};
    }

    get isRunning(): boolean {
        return this._child !== null;
    }

    get isStopping(): boolean {
        return this._stopping;
    }

    // ── Pré-checagem ──────────────────────────────────────────────────────

    checkDocker(timeoutMs = DEFAULT_CHECK_TIMEOUT_MS): Promise<DockerCheck> {
        return new Promise((resolve) => {
            let settled = false;
            let out = '';
            let err = '';
            const finish = (r: DockerCheck) => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    resolve(r);
                }
            };

            let child: ChildProcess;
            try {
                child = this._deps.spawn('docker', ['info', '--format', '{{.ServerVersion}}'], {stdio: ['ignore', 'pipe', 'pipe']});
            } catch (e) {
                finish({ok: false, reason: 'docker_missing', detail: (e as Error).message});
                return;
            }

            const timer = setTimeout(() => {
                try {
                    child.kill('SIGKILL');
                } catch { /* já morreu */ }
                finish({ok: false, reason: 'docker_stopped', detail: `docker info não respondeu em ${Math.round(timeoutMs / 1000)} s`});
            }, timeoutMs);

            child.stdout?.on('data', (c: Buffer | string) => (out += String(c)));
            child.stderr?.on('data', (c: Buffer | string) => (err += String(c)));
            child.on('error', (e: NodeJS.ErrnoException) => {
                finish(e.code === 'ENOENT'
                    ? {ok: false, reason: 'docker_missing', detail: e.message}
                    : {ok: false, reason: 'docker_stopped', detail: e.message});
            });
            child.on('close', (code) => {
                if (code === 0) {
                    finish({ok: true, version: out.trim()});
                } else {
                    finish({ok: false, reason: 'docker_stopped', detail: (err || out).trim() || `docker info saiu com código ${code}`});
                }
            });
        });
    }

    // ── Execução ──────────────────────────────────────────────────────────

    /** Inicia a execução. Devolve false se já há uma em andamento. */
    run(opts: RunOptions): boolean {
        if (this._child) {
            return false;
        }
        this._stopping = false;

        const workflowInContainer = `/workspace/${opts.workflowRelPath.replace(/^\/+/, '')}`;
        const args = [
            'compose', 'run', '--rm', '--build', 'act-runner',
            'workflow_dispatch', '-W', workflowInContainer,
            '-s', 'GITHUB_TOKEN', '-s', 'MSGRAM_TOKEN',
        ];
        const env = {
            ...process.env,
            WORKSPACE_PATH: opts.workspacePath,
            WORKFLOW_REL_PATH: opts.workflowRelPath,
            GITHUB_TOKEN: opts.githubToken,
            MSGRAM_TOKEN: opts.msgramToken,
        };

        const mask = makeMasker([opts.githubToken, opts.msgramToken]);
        let child: ChildProcess;
        try {
            child = this._deps.spawn('docker', args, {cwd: opts.dockerDir, env, stdio: ['ignore', 'pipe', 'pipe']});
        } catch (e) {
            opts.onLine(`Não foi possível iniciar o Docker: ${(e as Error).message}`, true);
            opts.onDone({success: false, exitCode: -1});
            return true;
        }
        this._child = child;
        this._dockerDir = opts.dockerDir;

        const outBuf = lineBuffer((l) => opts.onLine(mask(l), false));
        const errBuf = lineBuffer((l) => opts.onLine(mask(l), true));
        child.stdout?.on('data', (c: Buffer | string) => outBuf.push(String(c)));
        child.stderr?.on('data', (c: Buffer | string) => errBuf.push(String(c)));

        let finished = false;
        const finish = (result: RunResult) => {
            if (finished) {
                return;
            }
            finished = true;
            outBuf.flush();
            errBuf.flush();
            this._child = null;
            const stopped = this._stopping;
            this._stopping = false;
            opts.onDone(stopped ? {...result, stopped: true} : result);
        };

        child.on('error', (e: Error) => {
            opts.onLine(`Erro ao executar o Docker: ${mask(e.message)}`, true);
            finish({success: false, exitCode: -1});
        });
        child.on('close', (code) => {
            const exitCode = code ?? -1;
            finish({success: exitCode === 0, exitCode});
        });

        return true;
    }

    // ── Cancelamento ──────────────────────────────────────────────────────

    /** Interrompe a execução em andamento e derruba o contêiner. */
    async stop(): Promise<void> {
        const child = this._child;
        if (!child) {
            return;
        }
        this._stopping = true;
        try {
            child.kill('SIGTERM');
        } catch { /* já encerrou */ }

        await new Promise<void>((resolve) => {
            let down: ChildProcess;
            try {
                down = this._deps.spawn('docker', ['compose', 'down', '--remove-orphans'], {
                    cwd: this._dockerDir,
                    stdio: 'ignore',
                });
            } catch {
                resolve();
                return;
            }
            const t = setTimeout(() => resolve(), 10_000);
            down.on('close', () => {
                clearTimeout(t);
                resolve();
            });
            down.on('error', () => {
                clearTimeout(t);
                resolve();
            });
        });
    }

    dispose(): void {
        void this.stop();
    }
}

// ── Utilitários ───────────────────────────────────────────────────────────

function makeMasker(secrets: string[]): (text: string) => string {
    const list = secrets.filter((s) => s && s.length >= 4);
    return (text: string) => list.reduce((acc, s) => acc.split(s).join('***'), text);
}

function lineBuffer(emit: (line: string) => void) {
    let pending = '';
    return {
        push(chunk: string) {
            pending += chunk;
            let idx: number;
            while ((idx = pending.indexOf('\n')) >= 0) {
                const line = pending.slice(0, idx).replace(/\r$/, '');
                pending = pending.slice(idx + 1);
                emit(line);
            }
        },
        flush() {
            if (pending.length) {
                emit(pending.replace(/\r$/, ''));
                pending = '';
            }
        },
    };
}

let shared: ActRunner | undefined;

/** Instância única por janela do VS Code: uma execução por vez. */
export function sharedActRunner(): ActRunner {
    return (shared ??= new ActRunner());
}

export function disposeSharedActRunner(): void {
    shared?.dispose();
    shared = undefined;
}
