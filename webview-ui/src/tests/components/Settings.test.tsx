import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {SettingsForUi} from '../../types';

const {mockGetState, mockSetState} = vi.hoisted(() => {
    const mockPostMessage = vi.fn();
    const mockGetState = vi.fn(() => ({}));
    const mockSetState = vi.fn();

    (globalThis as unknown as Record<string, unknown>).acquireVsCodeApi = vi.fn(() => ({
        postMessage: mockPostMessage,
        getState: mockGetState,
        setState: mockSetState,
    }));

    return {mockGetState, mockSetState};
});

const {SettingsView} = await import('../../components/SettingsView');

const FULL: SettingsForUi = {
    serviceUrl: 'https://api.example.com',
    productName: 'My Product',
    organizationName: 'Minha Org',
    sonarProjectKey: 'my-project',
    workflowName: 'CI',
    requestTimeoutMs: 20000,
    grafanaAllowedHosts: ['g.example.com'],
    hasMsgramToken: true,
    hasGithubToken: false,
};

function input(id: string): HTMLInputElement {
    return document.getElementById(id) as HTMLInputElement;
}

describe('SettingsView', () => {
    const onSave = vi.fn();
    const onClearSecret = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetState.mockReturnValue({});
    });

    describe('valores padrão', () => {
        it('deve renderizar o container com id "view-settings"', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(document.getElementById('view-settings')).toBeInTheDocument();
        });

        it('serviceUrl padrão é a infraestrutura oficial', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(input('inp-serviceurl').value).toBe('https://msgram.lappis.rocks');
        });

        it('productName começa vazio e workflowName em "Build"', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(input('inp-product').value).toBe('');
            expect(input('inp-workflowname').value).toBe('Build');
        });

        it('campos de token são type="password"', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(input('inp-msgram-token')).toHaveAttribute('type', 'password');
            expect(input('inp-github-token')).toHaveAttribute('type', 'password');
        });

        it('nunca mostra a URL antiga fora do ar', () => {
            const {container} = render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(container.innerHTML).not.toContain('synaptha');
        });
    });

    describe('initialData', () => {
        it('preenche os campos não sensíveis', () => {
            render(<SettingsView initialData={FULL} onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(input('inp-serviceurl').value).toBe('https://api.example.com');
            expect(input('inp-product').value).toBe('My Product');
            expect(input('inp-org').value).toBe('Minha Org');
            expect(input('inp-sonar-key').value).toBe('my-project');
            expect(input('inp-workflowname').value).toBe('CI');
        });

        it('token salvo aparece como "salvo ✓" com campo vazio, sem o valor', () => {
            render(<SettingsView initialData={FULL} onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(input('inp-msgram-token').value).toBe('');
            expect(screen.getByTestId('msgram-token-status')).toHaveTextContent(/salvo/i);
            expect(input('inp-msgram-token').placeholder).toMatch(/salvo/i);
        });

        it('token não salvo mostra "não configurado"', () => {
            render(<SettingsView initialData={FULL} onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(screen.getByTestId('github-token-status')).toHaveTextContent(/não configurado/i);
        });

        it('botão "remover" só aparece para token salvo e envia onClearSecret', () => {
            render(<SettingsView initialData={FULL} onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(screen.queryByTestId('clear-github-token')).not.toBeInTheDocument();
            fireEvent.click(screen.getByTestId('clear-msgram-token'));
            expect(onClearSecret).toHaveBeenCalledWith('msgram.token');
        });

        it('dá preferência ao rascunho do estado sobre initialData', () => {
            mockGetState.mockReturnValue({settingsDraft: {serviceUrl: 'https://draft.com'}});
            render(<SettingsView initialData={FULL} onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(input('inp-serviceurl').value).toBe('https://draft.com');
        });
    });

    describe('edição e rascunho', () => {
        it.each([
            ['inp-serviceurl', 'https://nova-url.com'],
            ['inp-msgram-token', 'novo-token'],
            ['inp-github-token', 'ghp_novo'],
            ['inp-sonar-key', 'sonar-key'],
            ['inp-product', 'Novo Produto'],
            ['inp-org', 'Outra Org'],
            ['inp-workflowname', 'Deploy'],
        ])('atualiza o campo "%s" ao digitar', (id, value) => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            fireEvent.change(input(id), {target: {value}});
            expect(input(id).value).toBe(value);
        });

        it('persiste o rascunho dos campos não sensíveis ao digitar', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            fireEvent.change(input('inp-product'), {target: {value: 'Produto Teste'}});
            const call = mockSetState.mock.calls[0][0] as {settingsDraft: Record<string, unknown>};
            expect(call.settingsDraft.productName).toBe('Produto Teste');
        });

        it('nunca grava tokens no rascunho', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            fireEvent.change(input('inp-msgram-token'), {target: {value: 'segredo-123'}});
            fireEvent.change(input('inp-github-token'), {target: {value: 'ghp_segredo'}});
            fireEvent.change(input('inp-product'), {target: {value: 'P'}});
            const dumped = JSON.stringify(mockSetState.mock.calls);
            expect(dumped).not.toContain('segredo-123');
            expect(dumped).not.toContain('ghp_segredo');
        });
    });

    describe('salvar', () => {
        it('chama onSave com os campos não sensíveis e sem tokens quando não digitados', () => {
            render(<SettingsView initialData={FULL} onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            fireEvent.click(screen.getByRole('button', {name: /salvar/i}));
            expect(onSave).toHaveBeenCalledTimes(1);
            const payload = onSave.mock.calls[0][0];
            expect(payload).toMatchObject({
                serviceUrl: 'https://api.example.com',
                productName: 'My Product',
                organizationName: 'Minha Org',
                sonarProjectKey: 'my-project',
                workflowName: 'CI',
                requestTimeoutMs: 20000,
                grafanaAllowedHosts: ['g.example.com'],
            });
            expect(payload.msgramServiceToken).toBeUndefined();
            expect(payload.githubToken).toBeUndefined();
        });

        it('inclui o token só quando foi digitado', () => {
            render(<SettingsView initialData={FULL} onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            fireEvent.change(input('inp-github-token'), {target: {value: 'ghp_novo'}});
            fireEvent.click(screen.getByRole('button', {name: /salvar/i}));
            const payload = onSave.mock.calls[0][0];
            expect(payload.githubToken).toBe('ghp_novo');
            expect(payload.msgramServiceToken).toBeUndefined();
        });

        it('limpa os campos de token depois de salvar', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            fireEvent.change(input('inp-msgram-token'), {target: {value: 'tok'}});
            fireEvent.click(screen.getByRole('button', {name: /salvar/i}));
            expect(input('inp-msgram-token').value).toBe('');
        });
    });

    describe('feedback', () => {
        it('não exibe o feedback quando savedFeedback é false', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(document.getElementById('save-fb')).not.toBeInTheDocument();
        });

        it('exibe "Configurações salvas" quando savedFeedback é true', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={true}/>);
            expect(document.getElementById('save-fb')).toBeInTheDocument();
            expect(screen.getByText(/salvas/i)).toBeInTheDocument();
        });

        it('explica onde cada coisa é guardada', () => {
            render(<SettingsView onSave={onSave} onClearSecret={onClearSecret} savedFeedback={false}/>);
            expect(screen.getByText(/Secret Storage/)).toBeInTheDocument();
            expect(screen.getByText(/settings\.json/)).toBeInTheDocument();
        });
    });
});
