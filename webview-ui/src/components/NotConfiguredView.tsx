import React from 'react';
import type {MissingSetting} from '../types';

interface NotConfiguredViewProps {
    missing: MissingSetting[];
    /** repositório da pasta aberta que não está em nenhum produto da conta */
    unregisteredRepo?: string;
    onOpenSettings: () => void;
    onOpenVscodeSettings: () => void;
    onRegisterRepo?: () => void;
}

const LABELS: Record<MissingSetting, string> = {
    token: 'Token do MeasureSoftGram',
    serviceUrl: 'URL do serviço',
    productName: 'Nome do produto',
};

/**
 * Tela exibida no lugar do painel quando falta configuração.
 * Nunca mostra score, repositórios ou avisos: não há dado real para mostrar.
 */
export const NotConfiguredView: React.FC<NotConfiguredViewProps> = ({missing, unregisteredRepo, onOpenSettings, onOpenVscodeSettings, onRegisterRepo}) => (
    <div className="vw on" id="view-not-configured">
        <div className="view-header">
            <div>
                <div className="view-title">
                    <i className="codicon codicon-gear" aria-hidden="true"/>
                    <span>Extensão não está configurada</span>
                </div>
                <div className="view-sub">
                    Informe os dados abaixo para ver a qualidade real do seu produto.
                </div>
            </div>
        </div>

        {unregisteredRepo && (
            <div className="notif warn-n" style={{marginBottom: 14}} data-testid="unregistered-repo">
                <i className="codicon codicon-repo" aria-hidden="true"/>
                <span>
                    O repositório <strong>{unregisteredRepo}</strong> não está cadastrado em nenhum produto desta conta.
                    Cadastre-o com um clique, ou informe abaixo o produto onde ele está.
                </span>
            </div>
        )}

        {unregisteredRepo && onRegisterRepo && (
            <div className="nc-actions">
                <button className="btn" type="button" onClick={onRegisterRepo} data-testid="register-repo">
                    <i className="codicon codicon-cloud-upload" aria-hidden="true"/> Cadastrar automaticamente
                </button>
            </div>
        )}

        <div className="notif" style={{marginBottom: 14}}>
            <i className="codicon codicon-info" aria-hidden="true"/>
            <span>
                Falta{missing.length > 1 ? 'm' : ''}:
            </span>
        </div>

        <ul className="nc-list" id="nc-missing">
            {missing.map((m) => (
                <li key={m} className="nc-item">
                    <i className="codicon codicon-warning" aria-hidden="true"/> {LABELS[m]}
                </li>
            ))}
        </ul>

        <div className="nc-actions">
            <button className="btn" type="button" onClick={onOpenSettings}>
                <i className="codicon codicon-settings-gear" aria-hidden="true"/> Abrir Settings
            </button>
            <button className="btn btn-secondary" type="button" onClick={onOpenVscodeSettings}>
                <i className="codicon codicon-file-code" aria-hidden="true"/> Editar settings.json
            </button>
        </div>

        <div className="nc-help">
            O token é gerado na sua conta do MeasureSoftGram e fica guardado no Secret Storage do VS Code.
        </div>
    </div>
);
