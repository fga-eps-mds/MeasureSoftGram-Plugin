import React, {useState} from 'react';
import type {SecretKey, SettingsForUi, SettingsPayload} from '../types';
import {getVSCodeAPI} from '../utils/vscode';

interface SettingsViewProps {
    /** Vem de settings_loaded. O componente deve ser remontado (key) quando mudar. */
    initialData?: Partial<SettingsForUi>;
    onSave: (data: SettingsPayload) => void;
    onClearSecret: (key: SecretKey) => void;
    savedFeedback: boolean;
}

export const DEFAULT_SERVICE_URL = 'https://msgram.lappis.rocks';

/** Rascunho dos campos não sensíveis. Tokens nunca entram aqui. */
type Draft = Partial<Pick<SettingsForUi,
    'serviceUrl' | 'productName' | 'organizationName' | 'sonarProjectKey' | 'workflowName'>>;

type DraftState = { settingsDraft?: Draft };

interface Form {
    serviceUrl: string;
    productName: string;
    organizationName: string;
    sonarProjectKey: string;
    workflowName: string;
    msgramServiceToken: string;
    githubToken: string;
}

function readDraft(): Draft {
    const state = getVSCodeAPI().getState() as DraftState | undefined;
    return state?.settingsDraft ?? {};
}

function writeDraft(draft: Draft) {
    const current = (getVSCodeAPI().getState() as Record<string, unknown> | undefined) ?? {};
    getVSCodeAPI().setState({...current, settingsDraft: draft});
}

function initialForm(initialData: Partial<SettingsForUi>): Form {
    const d = readDraft();
    return {
        serviceUrl: d.serviceUrl ?? initialData.serviceUrl ?? DEFAULT_SERVICE_URL,
        productName: d.productName ?? initialData.productName ?? '',
        organizationName: d.organizationName ?? initialData.organizationName ?? '',
        sonarProjectKey: d.sonarProjectKey ?? initialData.sonarProjectKey ?? '',
        workflowName: d.workflowName ?? initialData.workflowName ?? 'Build',
        msgramServiceToken: '',
        githubToken: '',
    };
}

function draftOf(form: Form): Draft {
    const {serviceUrl, productName, organizationName, sonarProjectKey, workflowName} = form;
    return {serviceUrl, productName, organizationName, sonarProjectKey, workflowName};
}

export const SettingsView: React.FC<SettingsViewProps> = ({
                                                              initialData = {},
                                                              onSave,
                                                              onClearSecret,
                                                              savedFeedback,
                                                          }) => {
    // Estado único, inicializado uma vez. O pai remonta o componente (key)
    // quando settings_loaded chega, então não há setState em efeito.
    const [form, setForm] = useState<Form>(() => initialForm(initialData));

    const hasMsgramToken = !!initialData.hasMsgramToken;
    const hasGithubToken = !!initialData.hasGithubToken;

    function change<K extends keyof Form>(field: K, value: Form[K]) {
        const next = {...form, [field]: value};
        setForm(next);
        writeDraft(draftOf(next));
    }

    const handleSave = () => {
        const payload: SettingsPayload = {
            serviceUrl: form.serviceUrl,
            productName: form.productName,
            organizationName: form.organizationName,
            sonarProjectKey: form.sonarProjectKey,
            workflowName: form.workflowName,
            requestTimeoutMs: initialData.requestTimeoutMs ?? 15000,
            grafanaAllowedHosts: initialData.grafanaAllowedHosts ?? [],
        };
        if (form.msgramServiceToken.trim()) {
            payload.msgramServiceToken = form.msgramServiceToken.trim();
        }
        if (form.githubToken.trim()) {
            payload.githubToken = form.githubToken.trim();
        }
        writeDraft(draftOf(form));
        onSave(payload);
        setForm({...form, msgramServiceToken: '', githubToken: ''});
    };

    const tokenStatus = (saved: boolean, testId: string, key: SecretKey, clearTestId: string) => (
        <div className="fd token-status" data-testid={testId}>
            {saved ? (
                <>
                    <i className="codicon codicon-lock" aria-hidden="true"/> salvo ✓ no Secret Storage.
                    Digite um novo valor para substituir, ou{' '}
                    <button
                        type="button"
                        className="link-btn"
                        data-testid={clearTestId}
                        onClick={() => onClearSecret(key)}
                    >
                        remover
                    </button>.
                </>
            ) : (
                <>
                    <i className="codicon codicon-unlock" aria-hidden="true"/> não configurado.
                </>
            )}
        </div>
    );

    return (
        <div className="vw" id="view-settings">
            <div className="sf">
                <div className="notif" style={{marginBottom: 14}}>
                    <i className="codicon codicon-info" aria-hidden="true"/>
                    <span>
                        Tokens ficam no Secret Storage do VS Code. Os demais campos ficam em{' '}
                        <code>settings.json</code> do workspace (prefixo <code>msgram.</code>).
                    </span>
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-serviceurl">MSGRAM Service URL</label>
                    <div className="fd">URL base do serviço MeasureSoftGram</div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-serviceurl"
                        placeholder={DEFAULT_SERVICE_URL}
                        value={form.serviceUrl}
                        onChange={(e) => change('serviceUrl', e.target.value)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-msgram-token">MSGRAM Service Token</label>
                    {tokenStatus(hasMsgramToken, 'msgram-token-status', 'msgram.token', 'clear-msgram-token')}
                    <input
                        className="fi"
                        type="password"
                        id="inp-msgram-token"
                        autoComplete="off"
                        placeholder={hasMsgramToken ? '•••••••• (salvo)' : 'cole o token da sua conta'}
                        value={form.msgramServiceToken}
                        onChange={(e) => change('msgramServiceToken', e.target.value)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-github-token">GitHub Token</label>
                    {tokenStatus(hasGithubToken, 'github-token-status', 'msgram.githubToken', 'clear-github-token')}
                    <input
                        className="fi"
                        type="password"
                        id="inp-github-token"
                        autoComplete="off"
                        placeholder={hasGithubToken ? '•••••••• (salvo)' : 'ghp_… (usado pela Action local)'}
                        value={form.githubToken}
                        onChange={(e) => change('githubToken', e.target.value)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-product">Product Name</label>
                    <div className="fd">Nome do produto cadastrado no MeasureSoftGram</div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-product"
                        placeholder="nome exato do produto"
                        value={form.productName}
                        onChange={(e) => change('productName', e.target.value)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-org">Organization (opcional)</label>
                    <div className="fd">Só é necessário quando sua conta tem mais de uma organização</div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-org"
                        placeholder="vazio = primeira organização"
                        value={form.organizationName}
                        onChange={(e) => change('organizationName', e.target.value)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-sonar-key">Sonar Project Key (opcional)</label>
                    <div className="fd">Chave do projeto no SonarCloud, usada pela Action</div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-sonar-key"
                        placeholder="meu-projeto-sonar"
                        value={form.sonarProjectKey}
                        onChange={(e) => change('sonarProjectKey', e.target.value)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-workflowname">Workflow Name</label>
                    <div className="fd">Nome do workflow de build que a Action observa (<code>on: workflow_run</code>)</div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-workflowname"
                        placeholder="Build"
                        value={form.workflowName}
                        onChange={(e) => change('workflowName', e.target.value)}
                    />
                </div>

                <div className="fsave">
                    <button className="btn" type="button" onClick={handleSave}>
                        <i className="codicon codicon-save" aria-hidden="true"/> Salvar
                    </button>
                    {savedFeedback && (
                        <span id="save-fb" className="feedback-ok">
                            <i className="codicon codicon-check" aria-hidden="true"/> Configurações salvas
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
