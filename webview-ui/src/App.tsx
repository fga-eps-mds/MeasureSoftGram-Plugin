import React, {useCallback, useEffect, useState} from 'react';
import {Sidebar} from './components/Sidebar';
import {Tabs} from './components/Tabs';
import {DashboardView} from './components/DashboardView';
import {GrafanaView} from './components/GrafanaView';
import {OutputView} from './components/action/OutputView.tsx';
import {SettingsView} from './components/SettingsView';
import {ActionView, type ActionBlocked} from './components/action/ActionView.tsx';
import {NotConfiguredView} from './components/NotConfiguredView';
import {getVSCodeAPI} from './utils/vscode';
import {now} from './utils/helpers';
import {DEFAULT_WORKFLOW_YAML} from './utils/defaultWorkflow';
import {applySettingsToYaml} from './utils/workflowYaml';
import {getMissingSettings} from './utils/validation';

import type {
    ExtensionMessage,
    GrafanaDashboard,
    LoadState,
    LogLine,
    MissingSetting,
    OrgItem,
    RepoItem,
    ScoreData,
    SecretKey,
    SettingsForUi,
    SettingsPayload,
    TabName,
} from './types/index';

const App: React.FC = () => {
    const vscode = getVSCodeAPI();

    const [activeTab, setActiveTab] = useState<TabName>('dashboard');

    const showTab = useCallback((tab: TabName) => {
        setActiveTab(tab);
        if (tab === 'action') {
            vscode.postMessage({command: 'request_yaml'});
        }
        if (tab === 'grafana') {
            vscode.postMessage({command: 'request_grafana_dashboards'});
        }
    }, [vscode]);

    const [loadState, setLoadState] = useState<LoadState>('loading');
    const [missing, setMissing] = useState<MissingSetting[]>([]);
    const [unregisteredRepo, setUnregisteredRepo] = useState<string | undefined>(undefined);
    const [scoreData, setScoreData] = useState<ScoreData | null>(null);
    const [scoreLoading, setScoreLoading] = useState(true);
    const [organizations, setOrganizations] = useState<OrgItem[]>([]);
    const [selectedOrgPk, setSelectedOrgPk] = useState<number | null>(null);
    const [repos, setRepos] = useState<RepoItem[]>([]);
    const [selectedRepoPk, setSelectedRepoPk] = useState<number | null>(null);
    const [notifText, setNotifText] = useState('');
    const [notifType, setNotifType] = useState<'ok' | 'error'>('ok');

    const [isRunning, setIsRunning] = useState(false);
    const [actionBlocked, setActionBlocked] = useState<ActionBlocked | null>(null);
    const [logLines, setLogLines] = useState<LogLine[]>([]);

    const appendLog = useCallback((text: string, isError: boolean) => {
        setLogLines(prev => [...prev, {time: now(), text, isError}]);
    }, []);

    const [settingsSavedFeedback, setSettingsSavedFeedback] = useState(false);
    const [settings, setSettings] = useState<Partial<SettingsForUi>>({});
    // Incrementa a cada settings_loaded para remontar o SettingsView com os valores novos.
    const [settingsVersion, setSettingsVersion] = useState(0);

    const [grafanaDashboards, setGrafanaDashboards] = useState<GrafanaDashboard[]>([]);
    const [grafanaLoading, setGrafanaLoading] = useState(false);
    const [grafanaIframeUrl, setGrafanaIframeUrl] = useState<string | null>(null);
    const [grafanaIframeTitle, setGrafanaIframeTitle] = useState<string | null>(null);
    const [grafanaError, setGrafanaError] = useState<string | null>(null);

    const [yaml, setYaml] = useState(DEFAULT_WORKFLOW_YAML);
    const [yamlExists, setYamlExists] = useState<boolean | null>(null);
    const [actionSavedFeedback, setActionSavedFeedback] = useState(false);
    const [actionAlert, setActionAlert] = useState<string | null>(null);

    useEffect(() => {
        vscode.postMessage({command: 'request_score'});
    }, [vscode]);

    useEffect(() => {
        const handler = (event: MessageEvent<ExtensionMessage>) => {
            const msg = event.data;
            switch (msg.command) {

                case 'not_configured':
                    setLoadState('not_configured');
                    setMissing(msg.missing);
                    setUnregisteredRepo(msg.unregisteredRepo);
                    setScoreLoading(false);
                    setScoreData(null);
                    setRepos([]);
                    setNotifText('');
                    break;

                case 'orgs_loaded':
                    setOrganizations(msg.organizations);
                    setSelectedOrgPk(msg.selectedOrgPk);
                    break;

                case 'repos_loaded':
                    setRepos(msg.repos);
                    if (msg.repos.length) {
                        setSelectedRepoPk(msg.selectedRepoPk ?? msg.repos[0].id);
                    }
                    break;

                case 'score_loading':
                    setLoadState('loading');
                    setScoreLoading(true);
                    break;

                case 'score_loaded':
                    setLoadState('ready');
                    setScoreLoading(false);
                    setNotifText('');
                    setScoreData(msg.data);
                    break;

                case 'score_error':
                    setLoadState('error');
                    setScoreLoading(false);
                    setScoreData(null);
                    setNotifText(msg.message);
                    setNotifType('error');
                    break;

                case 'analysis_blocked':
                    setIsRunning(false);
                    setActionBlocked({reason: msg.reason, detail: msg.detail});
                    break;

                case 'analysis_started':
                    setIsRunning(true);
                    setActionBlocked(null);
                    setLogLines([]);
                    showTab('output');
                    break;

                case 'output_line':
                    appendLog(msg.line, msg.isError);
                    break;

                case 'analysis_done':
                    setIsRunning(false);
                    appendLog(
                        msg.success
                            ? 'Execução concluída com sucesso.'
                            : `Execução encerrou com código ${msg.exitCode}.`,
                        !msg.success,
                    );
                    break;

                case 'analysis_stopped':
                    setIsRunning(false);
                    appendLog('Execução interrompida pelo usuário.', true);
                    break;

                case 'yaml_loaded':
                    setYaml(msg.yaml || DEFAULT_WORKFLOW_YAML);
                    setYamlExists(!!msg.exists);
                    break;

                case 'action_saved':
                    setActionSavedFeedback(true);
                    setTimeout(() => setActionSavedFeedback(false), 3000);
                    break;

                case 'settings_saved':
                    setSettingsSavedFeedback(true);
                    setTimeout(() => setSettingsSavedFeedback(false), 3000);
                    break;

                case 'settings_loaded':
                    setSettings(msg.data);
                    setSettingsVersion((v) => v + 1);
                    break;

                case 'grafana_loading':
                    setGrafanaLoading(true);
                    setGrafanaError(null);
                    break;

                case 'grafana_dashboards_loaded':
                    setGrafanaLoading(false);
                    setGrafanaDashboards(msg.dashboards);
                    break;

                case 'grafana_dashboard_loaded':
                    setGrafanaLoading(false);
                    setGrafanaIframeUrl(msg.url);
                    setGrafanaIframeTitle(msg.title);
                    break;

                case 'grafana_error':
                    setGrafanaLoading(false);
                    setGrafanaError(msg.message);
                    break;

                case 'show_tab':
                    showTab(msg.tab);
                    if (msg.tab === 'grafana' && msg.dashboardUid) {
                        vscode.postMessage({command: 'request_grafana_dashboard', uid: msg.dashboardUid});
                    }
                    break;
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, [showTab, appendLog, vscode]);

    const handleSelectOrg = (orgPk: number) => {
        setSelectedOrgPk(orgPk);
        vscode.postMessage({command: 'select_org', orgPk});
    };

    const handleRetry = () => {
        vscode.postMessage({command: 'retry'});
    };

    const handleOpenVscodeSettings = () => {
        vscode.postMessage({command: 'open_vscode_settings'});
    };

    const handleRegisterRepo = () => {
        vscode.postMessage({command: 'register_repo'});
    };

    const handleSelectRepo = (repoPk: number) => {
        setSelectedRepoPk(repoPk);
        vscode.postMessage({command: 'select_repo', repoPk});
    };

    const handleSaveSettings = (data: SettingsPayload) => {
        // Atualiza o que já dá para saber; a extensão responde settings_loaded com as flags reais.
        setSettings((prev) => ({
            ...prev,
            serviceUrl: data.serviceUrl,
            productName: data.productName,
            organizationName: data.organizationName,
            sonarProjectKey: data.sonarProjectKey,
            workflowName: data.workflowName,
            hasMsgramToken: prev.hasMsgramToken || !!data.msgramServiceToken,
            hasGithubToken: prev.hasGithubToken || !!data.githubToken,
        }));
        vscode.postMessage({command: 'save_settings', data});
    };

    const handleClearSecret = (key: SecretKey) => {
        vscode.postMessage({command: 'clear_secret', key});
    };

    const handleSaveAction = () => {
        const mergedYaml = applySettingsToYaml(yaml, settings);
        setYaml(mergedYaml);
        vscode.postMessage({command: 'save_action', yaml: mergedYaml});
    };

    const handleSelectGrafanaDashboard = (uid: string) => {
        vscode.postMessage({command: 'request_grafana_dashboard', uid});
    };

    const handleGrafanaBack = () => {
        setGrafanaIframeUrl(null);
        setGrafanaIframeTitle(null);
    };

    const handleRunAction = () => {
        const missing = getMissingSettings(settings);
        if (missing.length > 0) {
            const message =
                'Preencha os campos obrigatórios em Settings antes de rodar a pipeline: ' +
                missing.map((m) => m.label).join(', ');
            setActionAlert(message);
            vscode.postMessage({command: 'show_warning', message});
            return;
        }
        setActionAlert(null);
        setActionBlocked(null);
        const mergedYaml = applySettingsToYaml(yaml, settings);
        setYaml(mergedYaml);
        vscode.postMessage({command: 'run_action', yaml: mergedYaml});
    };

    const handleStopAction = () => {
        vscode.postMessage({command: 'stop_analysis'});
    };

    return (
        <>
            <Sidebar
                scoreData={scoreData}
                scoreLoading={scoreLoading}
                scoreError={!scoreLoading && scoreData === null && notifType === 'error'}
                repos={repos}
                selectedRepoPk={selectedRepoPk}
                onSelectRepo={handleSelectRepo}
                activeTab={activeTab}
                onShowTab={showTab}
                organizations={organizations}
                selectedOrgPk={selectedOrgPk}
                onSelectOrg={handleSelectOrg}
            />

            <Tabs active={activeTab} onSelect={showTab}/>

            <div className="pc">

                {activeTab === 'dashboard' && loadState === 'not_configured' && (
                    <NotConfiguredView
                        missing={missing}
                        unregisteredRepo={unregisteredRepo}
                        onRegisterRepo={handleRegisterRepo}
                        onOpenSettings={() => showTab('settings')}
                        onOpenVscodeSettings={handleOpenVscodeSettings}
                    />
                )}

                {activeTab === 'dashboard' && loadState !== 'not_configured' && (
                    <DashboardView
                        scoreData={scoreData}
                        scoreLoading={scoreLoading}
                        productName={settings.productName ?? ''}
                        repoName={repos.find((r) => r.id === selectedRepoPk)?.name}
                        notifText={notifText}
                        notifType={notifType}
                        onRetry={handleRetry}
                    />
                )}

                {activeTab === 'grafana' && (
                    <GrafanaView
                        dashboards={grafanaDashboards}
                        loading={grafanaLoading}
                        iframeUrl={grafanaIframeUrl}
                        iframeTitle={grafanaIframeTitle}
                        error={grafanaError}
                        hasContext={repos.length > 0}
                        onSelectDashboard={handleSelectGrafanaDashboard}
                        onBack={handleGrafanaBack}
                    />
                )}

                {activeTab === 'output' && (
                    <OutputView lines={logLines}/>
                )}

                {activeTab === 'settings' && (
                    <SettingsView
                        key={settingsVersion}
                        initialData={settings}
                        onSave={handleSaveSettings}
                        onClearSecret={handleClearSecret}
                        savedFeedback={settingsSavedFeedback}
                    />
                )}

                {activeTab === 'action' && (
                    <ActionView
                        yaml={yaml}
                        onChange={setYaml}
                        onSave={handleSaveAction}
                        savedFeedback={actionSavedFeedback}
                        onRun={handleRunAction}
                        onStop={handleStopAction}
                        running={isRunning}
                        alert={actionAlert}
                        blocked={actionBlocked}
                        yamlExists={yamlExists}
                    />
                )}

            </div>
        </>
    );
};

export default App;
