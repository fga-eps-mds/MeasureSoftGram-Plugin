import React, {useEffect, useState} from 'react';
import type {SettingsData} from '../types';
import {getVSCodeAPI} from '../utils/vscode';

interface SettingsViewProps {
    initialData?: Partial<SettingsData>;
    onSave: (data: SettingsData) => void;
    savedFeedback: boolean;
}

type DraftState = { settingsDraft?: Partial<SettingsData> };

function readDraft(): Partial<SettingsData> {
    const state = getVSCodeAPI().getState() as DraftState | undefined;
    return state?.settingsDraft ?? {};
}

function writeDraft(draft: Partial<SettingsData>) {
    const current = (getVSCodeAPI().getState() as Record<string, unknown> | undefined) ?? {};
    getVSCodeAPI().setState({...current, settingsDraft: draft});
}

export const SettingsView: React.FC<SettingsViewProps> = ({
                                                              initialData = {},
                                                              onSave,
                                                              savedFeedback,
                                                          }) => {
    const draft = readDraft();

    const [serviceUrl, setServiceUrl] = useState(draft.serviceUrl || initialData.serviceUrl || 'https://msgram-api.synaptha.com/');
    const [msgramServiceToken, setMsgramServiceToken] = useState(draft.msgramServiceToken || initialData.msgramServiceToken || '');
    const [githubToken, setGithubToken] = useState(draft.githubToken || initialData.githubToken || '');
    const [sonarProjectKey, setSonarProjectKey] = useState(draft.sonarProjectKey || initialData.sonarProjectKey || '');
    const [productName, setProductName] = useState(draft.productName || initialData.productName || 'measuresoftgram 2026');
    const [workflowName, setWorkflowName] = useState(draft.workflowName || initialData.workflowName || 'Build');

    // Sync when extension sends settings_loaded with persisted values
    useEffect(() => {
        if (!initialData || Object.keys(initialData).length === 0) {
            return;
        }
        const d = readDraft();
        setServiceUrl(d.serviceUrl || initialData.serviceUrl || 'https://msgram-api.synaptha.com/');
        setMsgramServiceToken(d.msgramServiceToken || initialData.msgramServiceToken || '');
        setGithubToken(d.githubToken || initialData.githubToken || '');
        setSonarProjectKey(d.sonarProjectKey || initialData.sonarProjectKey || '');
        setProductName(d.productName || initialData.productName || 'measuresoftgram 2026');
        setWorkflowName(d.workflowName || initialData.workflowName || 'Build');
    }, [initialData]);

    function change(field: keyof SettingsData, value: string, setter: (v: string) => void) {
        setter(value);
        const current: Partial<SettingsData> = {
            serviceUrl, msgramServiceToken, githubToken,
            sonarProjectKey, productName, workflowName,
            [field]: value,
        };
        writeDraft(current);
    }

    const handleSave = () => {
        const data: SettingsData = {
            serviceUrl, msgramServiceToken, githubToken,
            sonarProjectKey, productName, workflowName,
        };
        writeDraft(data);
        onSave(data);
    };

    return (
        <div className="vw" id="view-settings">
            <div className="sf">
                <div className="notif" style={{marginBottom: 14}}>
                    <i className="ti ti-info-circle"/>
                    <span>
            Configurações salvas no workspace. Tokens armazenados no Secret Storage do VSCode.
          </span>
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-serviceurl">MSGRAM Service URL</label>
                    <div className="fd">URL base da API MSGRAM (ex: https://api.msgram.io)</div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-serviceurl"
                        placeholder="https://api.msgram.io"
                        value={serviceUrl}
                        onChange={(e) => change('serviceUrl', e.target.value, setServiceUrl)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-msgram-token">MSGRAM Service Token</label>
                    <div className="fd">Token de autenticação da API MSGRAM (msgramServiceToken)</div>
                    <input
                        className="fi"
                        type="password"
                        id="inp-msgram-token"
                        placeholder="••••••••••••••••"
                        value={msgramServiceToken}
                        onChange={(e) => change('msgramServiceToken', e.target.value, setMsgramServiceToken)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-github-token">GitHub Token</label>
                    <div className="fd">Token usado pela action para acessar a API do GitHub (githubToken)</div>
                    <input
                        className="fi"
                        type="password"
                        id="inp-github-token"
                        placeholder="ghp_••••••••••••••••"
                        value={githubToken}
                        onChange={(e) => change('githubToken', e.target.value, setGithubToken)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-sonar-key">Sonar Project Key</label>
                    <div className="fd">
                        Chave do projeto no SonarQube (opcional, necessária se "Collect Sonarqube Metrics" estiver
                        ativo)
                    </div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-sonar-key"
                        placeholder="meu-projeto-sonar"
                        value={sonarProjectKey}
                        onChange={(e) => change('sonarProjectKey', e.target.value, setSonarProjectKey)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-product">Product Name</label>
                    <div className="fd">Nome do produto cadastrado no MSGRAM 1 (productName)</div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-product"
                        placeholder="measuresoftgram 2026"
                        value={productName}
                        onChange={(e) => change('productName', e.target.value, setProductName)}
                    />
                </div>

                <div className="fg">
                    <label className="fl" htmlFor="inp-workflowname">Workflow Name</label>
                    <div className="fd">
                        Nome do workflow que realiza a build da release (workflowName), usado no "on: workflow_run"
                    </div>
                    <input
                        className="fi"
                        type="text"
                        id="inp-workflowname"
                        placeholder="Build"
                        value={workflowName}
                        onChange={(e) => change('workflowName', e.target.value, setWorkflowName)}
                    />
                </div>

                <div className="fsave">
                    <button className="btn" onClick={handleSave}>
                        <i className="ti ti-device-floppy"/> Salvar e validar conexão
                    </button>
                    {savedFeedback && (
                        <span id="save-fb" className="feedback-ok">
              <i className="ti ti-check"/> Conexão validada
            </span>
                    )}
                </div>
            </div>
        </div>
    );
};
