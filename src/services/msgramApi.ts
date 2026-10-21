/**
 * Cliente do MeasureSoftGram-Service.
 *
 * Rotas e formatos: specs/001-fix-diagnostico-2026-2/contracts/msgram-api.md.
 * Não existe mais caminho "mockado": sem token o serviço responde 401 e o
 * erro sobe como HttpError{kind:'auth'}. A classe base evita chegar aqui
 * quando a extensão não está configurada.
 */
import {getAll, HttpError, request} from './httpClient';
import {timestamp as ts} from '../utilities/log';
import type {Characteristic, OrgItem, RepoItem, ScoreData} from '../panels/messages';
import {pickMatchingRepo, WorkspaceHints} from '../utilities/workspaceRepo';

export type {Characteristic, OrgItem, RepoItem, ScoreData};

export type Logger = (message: string) => void;

export interface MsgramSettings {
  serviceUrl: string;
  token: string;
  productName: string;
  /** vazio = primeira organização */
  organizationName?: string;
  /** escolhida no seletor da interface; tem prioridade sobre o nome */
  organizationPk?: number;
  requestTimeoutMs?: number;
}

export interface RepoContext {
  orgPk: number;
  orgName: string;
  organizations: OrgItem[];
  productPk: number;
  productName: string;
  repos: RepoItem[];
}

// ── Grafana types ─────────────────────────────────────────────────────────────

export interface GrafanaDashboard {
  uid: string;
  title: string;
  description: string;
  tags: string[];
  has_repo_selector: boolean;
}

export interface GrafanaDashboardDetail {
  dashboard_uid: string;
  title: string;
  grafana_url: string;
  product_id: number;
  repository: { id: number; name: string } | null;
}

// ── Internal types ────────────────────────────────────────────────────────────

interface ProductItem {
  id: number;
  name: string;
}

interface TsqmiResp {
  value: number | null;
}

interface CharItem {
  key: string;
  name: string;
  latest: { value: number; created_at: string } | null;
}

interface GoalResp {
  data: Record<string, number>;
}

const noop: Logger = () => {};

function norm(s: string): string {
  return (s ?? '').trim().toLowerCase();
}

function apiBase(settings: MsgramSettings): string {
  return `${settings.serviceUrl.replace(/\/+$/, '')}/api/v1`;
}

function opts(settings: MsgramSettings) {
  return {token: settings.token, timeoutMs: settings.requestTimeoutMs};
}

// ── Organização → produto → repositórios ─────────────────────────────────────

export async function fetchRepositories(settings: MsgramSettings, log: Logger = noop): Promise<RepoContext> {
  const base = apiBase(settings);
  const o = opts(settings);

  const orgsUrl = `${base}/organizations/`;
  log(`[${ts()}] GET ${orgsUrl}`);
  const organizations = await getAll<OrgItem>(orgsUrl, o);
  if (!organizations.length) {
    throw new HttpError('Nenhuma organização encontrada para este token.', 'not_found', 404);
  }

  let org = organizations[0];
  const wanted = norm(settings.organizationName ?? '');
  const byPk = settings.organizationPk !== undefined ? organizations.find((x) => x.id === settings.organizationPk) : undefined;
  if (byPk) {
    org = byPk;
  } else if (wanted) {
    const found = organizations.find((x) => norm(x.name) === wanted);
    if (!found) {
      throw new HttpError(
          `Organização "${settings.organizationName}" não encontrada. Disponíveis: ${organizations.map((x) => x.name).join(', ')}`,
          'not_found', 404,
      );
    }
    org = found;
  }
  log(`[${ts()}] → Organização: "${org.name}" (id=${org.id})`);

  const productsUrl = `${base}/organizations/${org.id}/products/`;
  log(`[${ts()}] GET ${productsUrl}`);
  const products = await getAll<ProductItem>(productsUrl, o);
  const product = products.find((p) => norm(p.name) === norm(settings.productName));
  if (!product) {
    const names = products.map((p) => p.name.trim()).join(', ') || 'nenhum';
    throw new HttpError(`Produto "${settings.productName}" não encontrado. Disponíveis: ${names}`, 'not_found', 404);
  }
  log(`[${ts()}] → Produto: "${product.name.trim()}" (id=${product.id})`);

  const reposUrl = `${base}/organizations/${org.id}/products/${product.id}/repositories/`;
  log(`[${ts()}] GET ${reposUrl}`);
  const repos = await getAll<RepoItem>(reposUrl, o);
  log(`[${ts()}] → ${repos.length} repositório(s): ${repos.map((r) => r.name).join(', ')}`);

  return {
    orgPk: org.id,
    orgName: org.name,
    organizations,
    productPk: product.id,
    productName: product.name.trim(),
    repos,
  };
}

export interface DiscoveredRepo extends RepoContext {
  repo: RepoItem;
}

/**
 * Procura, em todas as organizações e produtos do token, um repositório que
 * case com a pasta aberta (remote origin ou nome da pasta). Devolve o
 * primeiro casamento exato; se não houver, o primeiro por sufixo.
 * Usado quando o produto configurado não contém o repositório atual.
 */
export async function discoverRepository(
    settings: Pick<MsgramSettings, 'serviceUrl' | 'token' | 'requestTimeoutMs'>,
    hints: WorkspaceHints,
    log: Logger = noop,
): Promise<DiscoveredRepo | null> {
  if (!hints.remoteName && !hints.folderName) {
    return null;
  }
  const base = apiBase(settings as MsgramSettings);
  const o = opts(settings as MsgramSettings);
  const organizations = await getAll<OrgItem>(`${base}/organizations/`, o);
  log(`[${ts()}] Procurando "${hints.remoteName ?? hints.folderName}" em ${organizations.length} organização(ões)…`);

  let fallback: DiscoveredRepo | null = null;
  const exactNames = [hints.remoteName, hints.folderName].filter((h): h is string => !!h).map((h) => norm(h));

  for (const org of organizations) {
    let products: ProductItem[];
    try {
      products = await getAll<ProductItem>(`${base}/organizations/${org.id}/products/`, o);
    } catch (err) {
      log(`[${ts()}] → "${org.name}": não foi possível listar produtos (${(err as Error).message}); pulando.`);
      continue;
    }
    for (const product of products) {
      let repos: RepoItem[];
      try {
        repos = await getAll<RepoItem>(`${base}/organizations/${org.id}/products/${product.id}/repositories/`, o);
      } catch (err) {
        log(`[${ts()}] → "${org.name}" / "${product.name.trim()}": sem acesso aos repositórios (${(err as Error).message}); pulando.`);
        continue;
      }
      const match = pickMatchingRepo(repos, hints);
      if (!match) {
        continue;
      }
      const found: DiscoveredRepo = {
        orgPk: org.id, orgName: org.name, organizations,
        productPk: product.id, productName: product.name.trim(), repos, repo: match,
      };
      if (exactNames.includes(norm(match.name))) {
        log(`[${ts()}] → Encontrado em "${org.name}" / "${product.name.trim()}": ${match.name}`);
        return found;
      }
      fallback ??= found;
    }
  }
  if (fallback) {
    log(`[${ts()}] → Encontrado por sufixo em "${fallback.orgName}" / "${fallback.productName}": ${fallback.repo.name}`);
  } else {
    log(`[${ts()}] → Repositório da pasta aberta não está em nenhum produto desta conta.`);
  }
  return fallback;
}

// ── Cadastro ──────────────────────────────────────────────────────────────────

export interface ProductSummary {
  id: number;
  name: string;
}

export async function listProducts(settings: MsgramSettings, orgPk: number, log: Logger = noop): Promise<ProductSummary[]> {
  const url = `${apiBase(settings)}/organizations/${orgPk}/products/`;
  log(`[${ts()}] GET ${url}`);
  const products = await getAll<ProductItem>(url, opts(settings));
  return products.map((p) => ({id: p.id, name: p.name.trim()}));
}

export async function createProduct(
    settings: MsgramSettings,
    orgPk: number,
    data: { name: string; description?: string },
    log: Logger = noop,
): Promise<ProductSummary> {
  const url = `${apiBase(settings)}/organizations/${orgPk}/products/`;
  log(`[${ts()}] POST ${url} (${data.name})`);
  const res = await request<ProductItem>(url, {...opts(settings), method: 'POST', body: {name: data.name, description: data.description ?? ''}});
  return {id: res.id, name: res.name.trim()};
}

/**
 * Cria o repositório no produto. O Service dispara a primeira coleta em
 * segundo plano (onboarding), então o score pode demorar alguns minutos.
 */
export async function createRepository(
    settings: MsgramSettings,
    orgPk: number,
    productPk: number,
    data: { name: string; url?: string; description?: string; platform?: 'github' | 'gitlab' | 'bitbucket' },
    log: Logger = noop,
): Promise<RepoItem> {
  const url = `${apiBase(settings)}/organizations/${orgPk}/products/${productPk}/repositories/`;
  log(`[${ts()}] POST ${url} (${data.name})`);
  const res = await request<RepoItem>(url, {
    ...opts(settings),
    method: 'POST',
    body: {name: data.name, url: data.url ?? '', description: data.description ?? '', platform: data.platform ?? 'github'},
  });
  return {id: res.id, name: res.name};
}

// ── Metas ─────────────────────────────────────────────────────────────────────

/**
 * Metas atuais do produto, por chave de característica, já em 0–1.
 * Devolve null quando o produto não tem meta (404 do serviço).
 */
export async function fetchGoals(
    settings: MsgramSettings,
    orgPk: number,
    productPk: number,
    log: Logger = noop,
): Promise<Map<string, number> | null> {
  const url = `${apiBase(settings)}/organizations/${orgPk}/products/${productPk}/current/goal/`;
  log(`[${ts()}] GET ${url}`);
  try {
    const res = await request<GoalResp>(url, opts(settings));
    const map = new Map<string, number>();
    for (const [key, raw] of Object.entries(res?.data ?? {})) {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        map.set(key, raw / 100);
      }
    }
    log(`[${ts()}] → ${map.size} meta(s)`);
    return map;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      log(`[${ts()}] → Produto sem meta definida.`);
      return null;
    }
    throw err;
  }
}

// ── Score por repositório ─────────────────────────────────────────────────────

export async function fetchScoreForRepo(
    settings: MsgramSettings,
    orgPk: number,
    productPk: number,
    repoPk: number,
    repoName: string,
    log: Logger = noop,
): Promise<ScoreData> {
  const base = `${apiBase(settings)}/organizations/${orgPk}/products/${productPk}/repositories/${repoPk}`;
  const tsqmiUrl = `${base}/latest-values/tsqmi/`;
  const charsUrl = `${base}/latest-values/characteristics/`;
  const o = opts(settings);

  log(`[${ts()}] Buscando métricas para repositório "${repoName}" (id=${repoPk})`);
  log(`[${ts()}] GET ${tsqmiUrl}`);
  log(`[${ts()}] GET ${charsUrl}`);

  const [tsqmi, chars, goals] = await Promise.all([
    request<TsqmiResp>(tsqmiUrl, o),
    getAll<CharItem>(charsUrl, o),
    fetchGoals(settings, orgPk, productPk, log),
  ]);

  const hasGoal = goals !== null;

  if (tsqmi?.value === null || tsqmi?.value === undefined) {
    log(`[${ts()}] Repositório "${repoName}" ainda não possui TSQMI calculado.`);
    return {score: 0, characteristics: [], lastAnalysisAt: null, noData: true, hasGoal};
  }

  const characteristics: Characteristic[] = chars
      .filter((c): c is CharItem & { latest: NonNullable<CharItem['latest']> } => !!c.latest)
      .map((c) => ({
        key: c.key,
        name: c.name,
        value: c.latest.value,
        goal: goals?.get(c.key) ?? null,
        measuredAt: c.latest.created_at,
      }));

  const lastAnalysisAt = characteristics.reduce<string | null>((max, c) => {
    if (!c.measuredAt) {
      return max;
    }
    return !max || new Date(c.measuredAt) > new Date(max) ? c.measuredAt : max;
  }, null);

  log(`[${ts()}] → TSQMI: ${tsqmi.value.toFixed(4)}`);
  characteristics.forEach((c) => log(`[${ts()}] → ${c.name}: ${c.value.toFixed(4)}${c.goal !== null ? ` (meta ${c.goal.toFixed(2)})` : ''}`));

  return {score: tsqmi.value, characteristics, lastAnalysisAt, noData: false, hasGoal};
}

// ── Grafana ───────────────────────────────────────────────────────────────────

export async function fetchGrafanaDashboards(settings: MsgramSettings, log: Logger = noop): Promise<GrafanaDashboard[]> {
  const url = `${apiBase(settings)}/grafana/dashboards/`;
  log(`[${ts()}] GET ${url}`);
  const dashboards = await getAll<GrafanaDashboard>(url, opts(settings));
  log(`[${ts()}] → ${dashboards.length} dashboard(s) encontrado(s).`);
  return dashboards;
}

export async function fetchGrafanaDashboard(
    settings: MsgramSettings,
    uid: string,
    productId: number,
    repositoryId?: number,
    log: Logger = noop,
): Promise<GrafanaDashboardDetail> {
  const params = new URLSearchParams({product_id: String(productId)});
  if (repositoryId !== undefined) {
    params.set('repository_id', String(repositoryId));
  }
  const url = `${apiBase(settings)}/grafana/dashboard/${encodeURIComponent(uid)}/?${params}`;
  log(`[${ts()}] GET ${url}`);
  const res = await request<GrafanaDashboardDetail>(url, opts(settings));
  log(`[${ts()}] → Dashboard "${res.title}" — ${res.grafana_url}`);
  return res;
}
