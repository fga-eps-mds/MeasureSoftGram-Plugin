/**
 * Descobre qual repositório do produto corresponde à pasta aberta no VS Code.
 *
 * Pistas, em ordem de confiança: nome do repositório no `remote origin` do
 * git, depois o nome da pasta. O casamento é por igualdade (ignorando
 * maiúsculas) e, se não houver, por sufixo (ex.: "2026.1-MeasureSoftGram-Plugin"
 * casa com "MeasureSoftGram-Plugin").
 */
import {execFile as nodeExecFile} from 'node:child_process';
import * as path from 'node:path';

export interface RepoLike {
    id: number;
    name: string;
}

export interface WorkspaceHints {
    /** nome do repositório extraído do remote origin, ex. "MeasureSoftGram-Plugin" */
    remoteName?: string;
    /** URL https do remote origin, ex. "https://github.com/org/Repo" */
    remoteUrl?: string;
    /** nome da pasta aberta */
    folderName?: string;
}

export interface WorkspaceRepoDeps {
    execFile: (cmd: string, args: string[], opts: { cwd: string; timeout?: number }) => Promise<{ stdout: string }>;
}

function defaultDeps(): WorkspaceRepoDeps {
    return {
        execFile: (cmd, args, opts) => new Promise((resolve, reject) => {
            nodeExecFile(cmd, args, {cwd: opts.cwd, timeout: opts.timeout ?? 3000}, (err, stdout) => {
                if (err) {
                    reject(err);
                } else {
                    resolve({stdout: String(stdout)});
                }
            });
        }),
    };
}

/** "git@github.com:org/Repo.git" ou "https://github.com/org/Repo.git" → "Repo". */
export function repoNameFromRemote(url: string): string | undefined {
    const trimmed = (url ?? '').trim();
    if (!trimmed) {
        return undefined;
    }
    const last = trimmed.replace(/\/+$/, '').split(/[/:]/).pop() ?? '';
    const name = last.replace(/\.git$/i, '').trim();
    return name || undefined;
}

/** "git@github.com:org/Repo.git" → "https://github.com/org/Repo"; https fica sem ".git". */
export function httpsUrlFromRemote(url: string): string | undefined {
    const t = (url ?? '').trim();
    if (!t) {
        return undefined;
    }
    const ssh = t.match(/^(?:ssh:\/\/)?(?:git@)?([^:/]+)[:/](.+?)(?:\.git)?\/?$/);
    if (/^https?:\/\//i.test(t)) {
        return t.replace(/\.git$/i, '').replace(/\/+$/, '');
    }
    if (ssh) {
        return `https://${ssh[1]}/${ssh[2]}`;
    }
    return undefined;
}

export async function detectWorkspaceHints(folderPath: string, deps: WorkspaceRepoDeps = defaultDeps()): Promise<WorkspaceHints> {
    const hints: WorkspaceHints = {folderName: path.basename(folderPath) || undefined};
    try {
        const {stdout} = await deps.execFile('git', ['config', '--get', 'remote.origin.url'], {cwd: folderPath});
        hints.remoteName = repoNameFromRemote(stdout);
        hints.remoteUrl = httpsUrlFromRemote(stdout);
    } catch {
        // sem git ou sem remote: fica só o nome da pasta
    }
    return hints;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Escolhe o repositório que melhor casa com as pistas. Devolve undefined
 * quando nenhuma pista bate, para o chamador usar o padrão (primeiro).
 */
export function pickMatchingRepo<T extends RepoLike>(repos: T[], hints: WorkspaceHints): T | undefined {
    const candidates = [hints.remoteName, hints.folderName].filter((h): h is string => !!h && h.trim().length > 0).map(norm);
    if (!candidates.length || !repos.length) {
        return undefined;
    }

    for (const hint of candidates) {
        const exact = repos.find((r) => norm(r.name) === hint);
        if (exact) {
            return exact;
        }
    }

    // Sufixo: "2026.1-measuresoftgram-plugin" termina com "measuresoftgram-plugin" (ou o inverso).
    let best: { repo: T; score: number } | undefined;
    for (const hint of candidates) {
        for (const repo of repos) {
            const name = norm(repo.name);
            const suffixMatch =
                (hint.endsWith(name) && /[-_./]/.test(hint.charAt(hint.length - name.length - 1) || '-')) ||
                (name.endsWith(hint) && /[-_./]/.test(name.charAt(name.length - hint.length - 1) || '-'));
            if (!suffixMatch) {
                continue;
            }
            const score = Math.min(name.length, hint.length);
            if (!best || score > best.score) {
                best = {repo, score};
            }
        }
    }
    return best?.repo;
}
