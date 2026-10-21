/**
 * Contrato de mensagens entre a extensão e a interface (webview).
 *
 * Espelhado em `webview-ui/src/types/index.ts`. Qualquer mudança aqui
 * precisa ser refletida lá e em `specs/.../contracts/webview-messages.md`.
 */

// ── Dados compartilhados ───────────────────────────────────────────────────

export interface RepoItem {
  id: number;
  name: string;
}

export interface OrgItem {
  id: number;
  name: string;
}

export interface Characteristic {
  /** chave do serviço, ex. "reliability" */
  key: string;
  /** nome legível, ex. "Reliability" */
  name: string;
  /** 0–1 */
  value: number;
  /** 0–1, ou null quando o produto não tem meta */
  goal: number | null;
  /** ISO 8601 */
  measuredAt: string;
}

export interface ScoreData {
  /** TSQMI 0–1 */
  score: number;
  characteristics: Characteristic[];
  /** max(measuredAt) ou null */
  lastAnalysisAt: string | null;
  /** true quando o repositório ainda não tem TSQMI calculado */
  noData: boolean;
  hasGoal: boolean;
}

export interface GrafanaDashboard {
  uid: string;
  title: string;
  description: string;
  tags: string[];
  has_repo_selector: boolean;
}

/** Configuração não sensível (data-model §1). */
export interface ProjectSettings {
  serviceUrl: string;
  productName: string;
  organizationName: string;
  sonarProjectKey: string;
  workflowName: string;
  requestTimeoutMs: number;
  grafanaAllowedHosts: string[];
}

/** O que a extensão envia à interface: nunca inclui o valor dos tokens. */
export interface SettingsForUi extends ProjectSettings {
  hasMsgramToken: boolean;
  hasGithubToken: boolean;
}

/** O que a interface envia ao salvar: token vazio ou ausente = manter. */
export interface SettingsPayload extends ProjectSettings {
  msgramServiceToken?: string;
  githubToken?: string;
}

export type SecretKey = 'msgram.token' | 'msgram.githubToken';

export type MissingSetting = 'token' | 'serviceUrl' | 'productName';

export type ScoreErrorKind = 'auth' | 'unavailable' | 'timeout' | 'not_found' | 'other';

export type AnalysisBlockedReason =
    | 'docker_missing'
    | 'docker_stopped'
    | 'already_running'
    | 'no_workspace';

// ── Interface → Extensão ───────────────────────────────────────────────────

export type PanelMessage =
    | { command: 'request_score' }
    | { command: 'select_repo'; repoPk: number }
    | { command: 'select_org'; orgPk: number }
    | { command: 'save_settings'; data: SettingsPayload }
    | { command: 'clear_secret'; key: SecretKey }
    | { command: 'open_vscode_settings' }
    | { command: 'register_repo' }
    | { command: 'retry' }
    | { command: 'request_yaml' }
    | { command: 'save_action'; yaml: string }
    | { command: 'run_action'; yaml: string }
    | { command: 'stop_analysis' }
    | { command: 'show_warning'; message: string }
    | { command: 'request_grafana_dashboards' }
    | { command: 'request_grafana_dashboard'; uid: string };

// ── Extensão → Interface ───────────────────────────────────────────────────

export type ExtensionMessage =
    | { command: 'not_configured'; missing: MissingSetting[]; unregisteredRepo?: string }
    | { command: 'settings_loaded'; data: SettingsForUi }
    | { command: 'settings_saved' }
    | { command: 'orgs_loaded'; organizations: OrgItem[]; selectedOrgPk: number }
    | { command: 'repos_loaded'; repos: RepoItem[]; selectedRepoPk?: number; detected?: boolean }
    | { command: 'score_loading' }
    | { command: 'score_loaded'; data: ScoreData }
    | { command: 'score_error'; message: string; kind: ScoreErrorKind }
    | { command: 'yaml_loaded'; yaml: string; exists: boolean }
    | { command: 'action_saved' }
    | { command: 'analysis_blocked'; reason: AnalysisBlockedReason; detail?: string }
    | { command: 'analysis_started' }
    | { command: 'output_line'; line: string; isError: boolean }
    | { command: 'analysis_done'; success: boolean; exitCode: number }
    | { command: 'analysis_stopped' }
    | { command: 'grafana_loading' }
    | { command: 'grafana_dashboards_loaded'; dashboards: GrafanaDashboard[] }
    | { command: 'grafana_dashboard_loaded'; url: string; title: string }
    | { command: 'grafana_error'; message: string }
    | { command: 'show_tab'; tab: 'dashboard' | 'output' | 'settings' | 'action' | 'grafana'; dashboardUid?: string };

export type ExtensionCommand = ExtensionMessage['command'];
export type PanelCommand = PanelMessage['command'];
