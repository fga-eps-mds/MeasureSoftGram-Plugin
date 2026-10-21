/**
 * Cadastro automático do repositório da pasta aberta no MeasureSoftGram.
 *
 * Fluxo: organização (Quick Pick se houver mais de uma) → produto (lista,
 * com opção "criar novo") → POST repositório → persiste produto/organização
 * na configuração do workspace. O Service dispara a primeira coleta em
 * segundo plano; o score aparece quando ela terminar.
 *
 * A interface (Quick Pick, input, mensagens) é injetável para os testes.
 */
import {getAll} from './httpClient';
import type {Logger, MsgramSettings, OrgItem, RepoItem} from './msgramApi';
import {
    createProduct as defaultCreateProduct,
    createRepository as defaultCreateRepository,
    listProducts as defaultListProducts,
    ProductSummary,
} from './msgramApi';
import type {WorkspaceHints} from '../utilities/workspaceRepo';

export interface RegisterUi {
    pick<T extends { label: string }>(items: T[], placeHolder: string): Promise<T | undefined>;
    input(prompt: string, value?: string): Promise<string | undefined>;
    confirm(message: string, okLabel: string): Promise<boolean>;
    info(message: string): void;
    warn(message: string): void;
}

export interface RegisterDeps {
    ui: RegisterUi;
    listOrganizations?: (settings: MsgramSettings) => Promise<OrgItem[]>;
    listProducts?: typeof defaultListProducts;
    createProduct?: typeof defaultCreateProduct;
    createRepository?: typeof defaultCreateRepository;
    persist: (patch: { productName: string; organizationName: string }) => Promise<void>;
    log?: Logger;
}

export type RegisterResult =
    | { kind: 'registered'; orgName: string; productName: string; repo: RepoItem }
    | { kind: 'cancelled' }
    | { kind: 'no_hints' };

const NEW_PRODUCT = '$(add) Criar um produto novo…';

async function defaultListOrganizations(settings: MsgramSettings): Promise<OrgItem[]> {
    return getAll<OrgItem>(`${settings.serviceUrl.replace(/\/+$/, '')}/api/v1/organizations/`, {token: settings.token, timeoutMs: settings.requestTimeoutMs});
}

export async function registerWorkspaceRepo(
    settings: MsgramSettings,
    hints: WorkspaceHints,
    deps: RegisterDeps,
): Promise<RegisterResult> {
    const name = hints.remoteName ?? hints.folderName;
    if (!name) {
        deps.ui.warn('Abra uma pasta de um repositório git para cadastrar.');
        return {kind: 'no_hints'};
    }
    const log = deps.log ?? (() => {});
    const listOrganizations = deps.listOrganizations ?? defaultListOrganizations;
    const listProducts = deps.listProducts ?? defaultListProducts;
    const createProduct = deps.createProduct ?? defaultCreateProduct;
    const createRepository = deps.createRepository ?? defaultCreateRepository;

    // 1) organização
    const orgs = await listOrganizations(settings);
    if (!orgs.length) {
        deps.ui.warn('Sua conta não tem nenhuma organização no MeasureSoftGram. Crie uma no site primeiro.');
        return {kind: 'cancelled'};
    }
    let org = orgs[0];
    if (orgs.length > 1) {
        const picked = await deps.ui.pick(orgs.map((o) => ({label: o.name, description: `id ${o.id}`, org: o})), `Organização para cadastrar "${name}"`);
        if (!picked) {
            return {kind: 'cancelled'};
        }
        org = picked.org;
    }

    // 2) produto (existente ou novo)
    const products = await listProducts(settings, org.id, log);
    const choice = await deps.ui.pick(
        [
            ...products.map((p) => ({label: p.name, description: `id ${p.id}`, product: p as ProductSummary | null})),
            {label: NEW_PRODUCT, description: 'cria o produto nesta organização', product: null},
        ],
        `Produto em "${org.name}" onde "${name}" vai entrar`,
    );
    if (!choice) {
        return {kind: 'cancelled'};
    }
    let product = choice.product;
    if (!product) {
        const productName = await deps.ui.input('Nome do produto novo', name);
        if (!productName || !productName.trim()) {
            return {kind: 'cancelled'};
        }
        product = await createProduct(settings, org.id, {name: productName.trim(), description: 'Criado pela extensão do VS Code'}, log);
        log(`[registro] produto criado: ${product.name} (id ${product.id})`);
    }

    // 3) confirmação e criação do repositório
    const ok = await deps.ui.confirm(
        `Cadastrar "${name}" no produto "${product.name}" (${org.name})? A primeira coleta de métricas roda em segundo plano no MeasureSoftGram.`,
        'Cadastrar',
    );
    if (!ok) {
        return {kind: 'cancelled'};
    }
    const repo = await createRepository(settings, org.id, product.id, {
        name,
        url: hints.remoteUrl,
        description: `Cadastrado pela extensão do VS Code a partir de ${hints.remoteUrl ?? hints.folderName ?? name}`,
        platform: 'github',
    }, log);
    log(`[registro] repositório criado: ${repo.name} (id ${repo.id}) em ${org.name}/${product.name}`);

    await deps.persist({productName: product.name, organizationName: org.name});
    deps.ui.info(`"${repo.name}" cadastrado em ${org.name} / ${product.name}. A primeira coleta pode levar alguns minutos; clique em Atualizar depois.`);
    return {kind: 'registered', orgName: org.name, productName: product.name, repo};
}
