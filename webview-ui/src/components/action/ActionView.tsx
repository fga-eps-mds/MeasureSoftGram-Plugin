import React from 'react';
import {YamlEditor} from './YamlEditor.tsx';
import {SaveButton} from './SaveButton.tsx';
import {CopyButton} from './CopyButton.tsx';
import {RunButton} from './RunButton.tsx';
import type {AnalysisBlockedReason} from '../../types';

export const DOCKER_INSTALL_URL = 'https://docs.docker.com/get-docker/';

export interface ActionBlocked {
    reason: AnalysisBlockedReason;
    detail?: string;
}

function blockedMessage(b: ActionBlocked): React.ReactNode {
    switch (b.reason) {
        case 'docker_missing':
            return (
                <>
                    O Docker é pré-requisito para executar a Action localmente e não foi encontrado.{' '}
                    <a href={DOCKER_INSTALL_URL} target="_blank" rel="noreferrer">Instale o Docker</a> e tente de novo.
                </>
            );
        case 'docker_stopped':
            return (
                <>
                    O Docker está instalado mas não respondeu. Inicie o Docker e tente de novo.
                    {b.detail && <span className="blocked-detail"> ({b.detail})</span>}
                </>
            );
        case 'already_running':
            return <>Já existe uma execução em andamento. Aguarde terminar ou clique em Parar.</>;
        case 'no_workspace':
            return <>Abra uma pasta no VS Code antes de executar.{b.detail && <span className="blocked-detail"> ({b.detail})</span>}</>;
        default:
            return <>Não foi possível executar.{b.detail && <span className="blocked-detail"> ({b.detail})</span>}</>;
    }
}

interface ActionViewProps {
    yaml: string;
    onChange: (yaml: string) => void;
    onSave: () => void;
    savedFeedback: boolean;
    onRun: () => void;
    onStop?: () => void;
    running: boolean;
    alert?: string | null;
    blocked?: ActionBlocked | null;
    /** true = carregado do msgram.yml do projeto; false = modelo; null = ainda não sabe */
    yamlExists?: boolean | null;
}

export const ActionView: React.FC<ActionViewProps> = ({
                                                          yaml,
                                                          onChange,
                                                          onSave,
                                                          savedFeedback,
                                                          onRun,
                                                          onStop = () => {},
                                                          running,
                                                          alert,
                                                          blocked = null,
                                                          yamlExists = null,
                                                      }) => (
    <div className="vw" id="view-action">
        <div className="sf">
            {alert && (
                <div className="notif err-n" style={{marginBottom: 12}}>
                    <i className="codicon codicon-warning" aria-hidden="true"/>
                    <span>{alert}</span>
                </div>
            )}

            {blocked && (
                <div className="notif warn-n" style={{marginBottom: 12}} data-testid="action-blocked">
                    <i className="codicon codicon-vm" aria-hidden="true"/>
                    <span>{blockedMessage(blocked)}</span>
                </div>
            )}

            <div className="notif" style={{marginBottom: 12}}>
                <i className="codicon codicon-info"/>
                <span>
                    Edite o <strong>msgram.yml</strong> abaixo.
                    {yamlExists !== null && (
                        <span className={`yaml-origin ${yamlExists ? 'existing' : 'new'}`} data-testid="yaml-origin">
                            {yamlExists
                                ? ' Arquivo existente em .github/workflows/msgram.yml: salvar sobrescreve.'
                                : ' Novo arquivo: será criado em .github/workflows/msgram.yml.'}
                        </span>
                    )}
                </span>
            </div>

            <YamlEditor value={yaml} onChange={onChange}/>

            <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8}}>
                <div style={{display: 'flex', gap: 8}}>
                    <div style={{flex: 1}}>
                        <SaveButton onSave={onSave} savedFeedback={savedFeedback}/>
                    </div>
                    <div style={{flex: 1}}>
                        <CopyButton getValue={() => yaml}/>
                    </div>
                </div>
                <div style={{width: '100%'}}>
                    <RunButton onRun={onRun} onStop={onStop} running={running}/>
                </div>
            </div>
        </div>
    </div>
);