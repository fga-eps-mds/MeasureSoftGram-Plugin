/**
 * Decide qual organização/produto/repositório mostrar para a pasta aberta.
 *
 * 1. Com produto configurado: carrega o produto; se a pasta aberta casa com
 *    um repositório dele, seleciona; senão tenta descobrir em toda a conta.
 * 2. Sem produto configurado: descobre em toda a conta.
 * 3. Ao descobrir em outro produto/organização, persiste os dois na
 *    configuração do workspace, para a próxima abertura ser direta.
 * 4. Sem casamento em lugar nenhum: fica no produto configurado (primeiro
 *    repositório) ou, sem produto, devolve `missingProduct`.
 *
 * Compartilhado pela classe base (painel) e pela árvore nativa.
 */
import type {Logger, MsgramSettings, RepoContext, RepoItem} from './msgramApi';
import {
    discoverRepository as defaultDiscover,
    fetchRepositories as defaultFetchRepositories,
} from './msgramApi';
import {HttpError} from './httpClient';
import {pickMatchingRepo, WorkspaceHints} from '../utilities/workspaceRepo';

export interface ResolveDeps {
    fetchRepositories?: typeof defaultFetchRepositories;
    discoverRepository?: typeof defaultDiscover;
    /** chamado quando o produto/organização descobertos diferem da configuração */
    persist?: (patch: { productName: string; organizationName: string }) => Promise<void>;
    log?: Logger;
}

export type ResolveResult =
    | {
    kind: 'ok';
    context: RepoContext;
    selectedRepo: RepoItem;
    /** true quando a pasta aberta determinou a escolha */
    detected: boolean;
    /** preenchido quando foi preciso trocar de produto/organização */
    switched?: { productName: string; orgName: string };
}
    | { kind: 'empty'; context: RepoContext }
    | { kind: 'missingProduct' };

export async function resolveRepoContext(
    settings: MsgramSettings,
    hints: WorkspaceHints,
    keepRepoPk: number | null,
    deps: ResolveDeps = {},
): Promise<ResolveResult> {
    const fetchRepositories = deps.fetchRepositories ?? defaultFetchRepositories;
    const discover = deps.discoverRepository ?? defaultDiscover;
    const log = deps.log ?? (() => {});
    const hasHints = !!(hints.remoteName || hints.folderName);

    let context: RepoContext | null = null;
    let productError: HttpError | null = null;

    if (settings.productName.trim()) {
        try {
            context = await fetchRepositories(settings, log);
        } catch (err) {
            // Produto configurado não existe (mais) nesta conta: ainda dá para descobrir.
            if (err instanceof HttpError && err.kind === 'not_found' && hasHints) {
                productError = err;
            } else {
                throw err;
            }
        }
    }

    if (context) {
        // Mantém a escolha da pessoa ao recarregar.
        const keep = keepRepoPk !== null ? context.repos.find((r) => r.id === keepRepoPk) : undefined;
        if (keep) {
            return {kind: 'ok', context, selectedRepo: keep, detected: false};
        }
        const match = hasHints ? pickMatchingRepo(context.repos, hints) : undefined;
        if (match) {
            return {kind: 'ok', context, selectedRepo: match, detected: true};
        }
    }

    if (hasHints) {
        const found = await discover(settings, hints, log);
        if (found) {
            const switched = !context || found.productPk !== context.productPk;
            const {repo, ...ctx} = found;
            if (switched) {
                await deps.persist?.({productName: ctx.productName, organizationName: ctx.orgName});
            }
            return {
                kind: 'ok',
                context: ctx,
                selectedRepo: repo,
                detected: true,
                switched: switched ? {productName: ctx.productName, orgName: ctx.orgName} : undefined,
            };
        }
    }

    if (context) {
        if (!context.repos.length) {
            return {kind: 'empty', context};
        }
        return {kind: 'ok', context, selectedRepo: context.repos[0], detected: false};
    }
    if (productError) {
        throw productError;
    }
    return {kind: 'missingProduct'};
}
