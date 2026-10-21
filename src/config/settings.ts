/**
 * Leitura e escrita das configurações da extensão.
 *
 * - Campos não sensíveis: `workspace.getConfiguration('msgram')`
 *   (escopo Workspace quando há pasta aberta, Global caso contrário).
 * - Tokens: `ExtensionContext.secrets`. Nunca vão para a configuração,
 *   para o estado da interface ou para o log.
 */
import type {MissingSetting, ProjectSettings, SecretKey, SettingsForUi, SettingsPayload} from '../panels/messages';

export const SECRET_MSGRAM_TOKEN: SecretKey = 'msgram.token';
export const SECRET_GITHUB_TOKEN: SecretKey = 'msgram.githubToken';

export const CONFIG_SECTION = 'msgram';

export const DEFAULT_SERVICE_URL = 'https://msgram.lappis.rocks';
export const DEFAULT_TIMEOUT_MS = 15_000;
export const MIN_TIMEOUT_MS = 1_000;
export const MAX_TIMEOUT_MS = 60_000;

/** Tudo que a extensão precisa internamente, incluindo os tokens. */
export interface FullSettings extends ProjectSettings {
  token: string;
  githubToken: string;
  /** Organização escolhida no seletor da interface nesta sessão (por id). */
  organizationPk?: number;
}

/** Subconjunto mínimo do `WorkspaceConfiguration` que usamos. */
export interface ConfigLike {
  get<T>(key: string, defaultValue?: T): T | undefined;

  update(key: string, value: unknown, target?: unknown): Thenable<void>;
}

/** Subconjunto mínimo do `SecretStorage` que usamos. */
export interface SecretsLike {
  get(key: string): Thenable<string | undefined>;

  store(key: string, value: string): Thenable<void>;

  delete(key: string): Thenable<void>;
}

export interface SettingsDeps {
  getConfiguration: () => ConfigLike;
  secrets: SecretsLike;
  hasWorkspaceFolder: () => boolean;
  ConfigurationTarget: { Global: unknown; Workspace: unknown };
}

/**
 * Deps reais, construídas a partir do `ExtensionContext`. O `require`
 * é feito aqui dentro para que os testes unitários consigam injetar fakes
 * sem carregar o módulo `vscode`.
 */
export function makeSettingsDeps(context: { secrets: SecretsLike }): SettingsDeps {
  const vscode = require('vscode');
  return {
    getConfiguration: () => vscode.workspace.getConfiguration(CONFIG_SECTION),
    secrets: context.secrets,
    hasWorkspaceFolder: () => (vscode.workspace.workspaceFolders?.length ?? 0) > 0,
    ConfigurationTarget: vscode.ConfigurationTarget,
  };
}

// ── Normalização ───────────────────────────────────────────────────────────

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Normaliza a URL base do serviço:
 * - remove espaços e barras finais (evita `//api/v1` nas rotas);
 * - adiciona `https://` quando não há esquema;
 * - força `https://` para hosts remotos; `http://` só para localhost.
 */
export function normalizeBaseUrl(input: string): string {
  let url = (input ?? '').trim();
  if (!url) {
    return '';
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, '');
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && !LOCAL_HOSTS.test(parsed.host)) {
      parsed.protocol = 'https:';
      url = parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    // URL malformada: devolve como está, a requisição vai falhar com erro claro
  }
  return url;
}

/**
 * O site do MeasureSoftGram mostra a chave como "Token abc123…". A API só
 * aceita o código, então o prefixo (e espaços) é removido ao salvar.
 */
export function normalizeToken(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^(token|bearer)\s+/i, '').trim();
}

function clampTimeout(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

// ── Leitura ────────────────────────────────────────────────────────────────

export function readProjectSettings(config: ConfigLike): ProjectSettings {
  return {
    serviceUrl: normalizeBaseUrl(asString(config.get('serviceUrl'), DEFAULT_SERVICE_URL)) || DEFAULT_SERVICE_URL,
    productName: asString(config.get('productName')).trim(),
    organizationName: asString(config.get('organizationName')).trim(),
    sonarProjectKey: asString(config.get('sonarProjectKey')).trim(),
    workflowName: asString(config.get('workflowName'), 'Build').trim() || 'Build',
    requestTimeoutMs: clampTimeout(config.get('requestTimeoutMs')),
    grafanaAllowedHosts: asStringArray(config.get('grafanaAllowedHosts')).map((h) => h.trim().toLowerCase()).filter(Boolean),
  };
}

export async function loadSettings(deps: SettingsDeps): Promise<FullSettings> {
  const project = readProjectSettings(deps.getConfiguration());
  const [token, githubToken] = await Promise.all([
    deps.secrets.get(SECRET_MSGRAM_TOKEN),
    deps.secrets.get(SECRET_GITHUB_TOKEN),
  ]);
  return {...project, token: token ?? '', githubToken: githubToken ?? ''};
}

/** Versão segura para enviar à interface: flags no lugar dos valores. */
export async function loadSettingsForUi(deps: SettingsDeps): Promise<SettingsForUi> {
  const full = await loadSettings(deps);
  const {token, githubToken, ...project} = full;
  return {
    ...project,
    hasMsgramToken: token.length > 0,
    hasGithubToken: githubToken.length > 0,
  };
}

// ── Escrita ────────────────────────────────────────────────────────────────

export async function saveSettings(payload: SettingsPayload, deps: SettingsDeps): Promise<void> {
  const config = deps.getConfiguration();
  const target = deps.hasWorkspaceFolder()
      ? deps.ConfigurationTarget.Workspace
      : deps.ConfigurationTarget.Global;

  const project: ProjectSettings = {
    serviceUrl: normalizeBaseUrl(payload.serviceUrl) || DEFAULT_SERVICE_URL,
    productName: (payload.productName ?? '').trim(),
    organizationName: (payload.organizationName ?? '').trim(),
    sonarProjectKey: (payload.sonarProjectKey ?? '').trim(),
    workflowName: (payload.workflowName ?? '').trim() || 'Build',
    requestTimeoutMs: clampTimeout(payload.requestTimeoutMs),
    grafanaAllowedHosts: asStringArray(payload.grafanaAllowedHosts),
  };

  for (const [key, value] of Object.entries(project)) {
    await config.update(key, value, target);
  }

  // Token vazio ou ausente significa "manter o que já existe".
  const msgramToken = normalizeToken(payload.msgramServiceToken);
  if (msgramToken) {
    await deps.secrets.store(SECRET_MSGRAM_TOKEN, msgramToken);
  }
  const githubToken = normalizeToken(payload.githubToken);
  if (githubToken) {
    await deps.secrets.store(SECRET_GITHUB_TOKEN, githubToken);
  }
}

/** Atualiza só alguns campos não sensíveis (ex.: produto descoberto pela pasta aberta). */
export async function updateProjectSettings(
    patch: Partial<Pick<ProjectSettings, 'productName' | 'organizationName' | 'serviceUrl'>>,
    deps: SettingsDeps,
): Promise<void> {
  const config = deps.getConfiguration();
  const target = deps.hasWorkspaceFolder() ? deps.ConfigurationTarget.Workspace : deps.ConfigurationTarget.Global;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      await config.update(key, key === 'serviceUrl' ? normalizeBaseUrl(String(value)) : String(value).trim(), target);
    }
  }
}

export async function clearSecret(key: SecretKey, deps: SettingsDeps): Promise<void> {
  await deps.secrets.delete(key);
}

// ── Validação ──────────────────────────────────────────────────────────────

/** Lista o que falta para a extensão conseguir falar com o serviço. */
export function isConfigured(settings: Pick<FullSettings, 'serviceUrl' | 'productName' | 'token'>): MissingSetting[] {
  const missing: MissingSetting[] = [];
  if (!settings.token || !settings.token.trim()) {
    missing.push('token');
  }
  if (!settings.serviceUrl || !settings.serviceUrl.trim()) {
    missing.push('serviceUrl');
  }
  if (!settings.productName || !settings.productName.trim()) {
    missing.push('productName');
  }
  return missing;
}
