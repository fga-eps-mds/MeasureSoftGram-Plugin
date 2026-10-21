import {act, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {mockPostMessage, mockGetState, mockSetState, mockGetMissingSettings} = vi.hoisted(() => {
    const mockPostMessage = vi.fn();
    const mockGetState = vi.fn(() => ({}));
    const mockSetState = vi.fn();
    const mockGetMissingSettings = vi.fn(() => [] as { label: string; field: string }[]);

    (globalThis as unknown as Record<string, unknown>).acquireVsCodeApi = vi.fn(() => ({
        postMessage: mockPostMessage,
        getState: mockGetState,
        setState: mockSetState,
    }));

    return {mockPostMessage, mockGetState, mockSetState, mockGetMissingSettings};
});

vi.mock('../components/Sidebar', () => ({
    Sidebar: (props: Record<string, unknown>) => (
        <div
            data-testid="sidebar"
            data-tab={props.activeTab as string}
            data-orgs={(props.organizations as unknown[] | undefined)?.length ?? 0}
            data-selected-org={String(props.selectedOrgPk ?? '')}
            data-selected-repo={String(props.selectedRepoPk ?? '')}
        >
            <button data-testid="select-org" onClick={() => (props.onSelectOrg as (pk: number) => void)?.(11)}>org</button>
        </div>
    ),
}));

vi.mock('../components/Tabs', () => ({
    Tabs: (props: { active: string; onSelect: (t: string) => void }) => (
        <div data-testid="tabs">
            {['dashboard', 'settings', 'action', 'output'].map((t) => (
                <button key={t} data-testid={`tab-${t}`} onClick={() => props.onSelect(t)}>
                    {t}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('../components/DashboardView', () => ({
    DashboardView: (props: { notifText: string; notifType: string; onRetry?: () => void }) => (
        <div data-testid="dashboard-view" data-notif={props.notifText} data-notif-type={props.notifType}>
            {props.onRetry && <button data-testid="retry" onClick={props.onRetry}>retry</button>}
        </div>
    ),
}));

vi.mock('../components/NotConfiguredView', () => ({
    NotConfiguredView: (props: { missing: string[]; onOpenSettings: () => void; onOpenVscodeSettings: () => void }) => (
        <div data-testid="not-configured" data-missing={props.missing.join(',')}>
            <button data-testid="nc-open-settings" onClick={props.onOpenSettings}>settings</button>
            <button data-testid="nc-open-json" onClick={props.onOpenVscodeSettings}>json</button>
        </div>
    ),
}));

vi.mock('../components/action/OutputView.tsx', () => ({
    OutputView: ({lines}: { lines: unknown[] }) => (
        <div data-testid="output-view" data-lines={lines.length}/>
    ),
}));

vi.mock('../components/SettingsView', () => ({
    SettingsView: ({onSave, savedFeedback}: { onSave: (d: unknown) => void; savedFeedback: boolean }) => (
        <div data-testid="settings-view">
            <button data-testid="settings-save" onClick={() => onSave({
                serviceUrl: 'https://api.test.com/',
                msgramServiceToken: 'tok',
                githubToken: 'ghp',
                sonarProjectKey: 'key',
                productName: 'Produto',
                workflowName: 'CI',
            })}>save
            </button>
            {savedFeedback && <span data-testid="settings-feedback"/>}
        </div>
    ),
}));

vi.mock('../components/action/ActionView.tsx', () => ({
    ActionView: ({onSave, onRun, onStop, savedFeedback, running, alert, blocked}: {
        onSave: () => void;
        onRun: () => void;
        onStop: () => void;
        savedFeedback: boolean;
        running: boolean;
        alert: string | null;
        blocked: {reason: string} | null;
    }) => (
        <div data-testid="action-view" data-blocked={blocked?.reason ?? ''}>
            <button data-testid="action-save" onClick={onSave}>save</button>
            <button data-testid="action-run" onClick={onRun}>run</button>
            <button data-testid="action-stop" onClick={onStop}>stop</button>
            {savedFeedback && <span data-testid="action-feedback"/>}
            {running && <span data-testid="action-running"/>}
            {alert && <span data-testid="action-alert">{alert}</span>}
        </div>
    ),
}));

vi.mock('../utils/helpers', () => ({
    now: () => '00:00:00',
    escHtml: (t: string) => t,
}));

vi.mock('../utils/defaultWorkflow', () => ({
    DEFAULT_WORKFLOW_YAML: 'yaml-padrao',
}));

vi.mock('../utils/workflowYaml', () => ({
    applySettingsToYaml: () => 'yaml-merged',
}));

vi.mock('../utils/vscode', () => ({
    getVSCodeAPI: () => ({
        postMessage: mockPostMessage,
        getState: mockGetState,
        setState: mockSetState,
    }),
}));

vi.mock('../utils/validation', () => ({
    getMissingSettings: mockGetMissingSettings,
}));

const {default: App} = await import('../App');

function sendMessage(data: unknown) {
    window.dispatchEvent(new MessageEvent('message', {data}));
}

describe('App', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetState.mockReturnValue({});
        mockGetMissingSettings.mockReturnValue([]);
    });

    describe('inicialização', () => {
        it('deve renderizar a aba dashboard por padrão', () => {
            render(<App/>);
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });

        it('deve enviar request_score ao montar', () => {
            render(<App/>);
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'request_score'});
        });

        it('deve renderizar Sidebar e Tabs', () => {
            render(<App/>);
            expect(screen.getByTestId('sidebar')).toBeInTheDocument();
            expect(screen.getByTestId('tabs')).toBeInTheDocument();
        });
    });

    describe('navegação de abas', () => {
        it('deve exibir SettingsView ao selecionar a aba settings', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-settings'));
            expect(screen.getByTestId('settings-view')).toBeInTheDocument();
        });

        it('deve exibir OutputView ao selecionar a aba output', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-output'));
            expect(screen.getByTestId('output-view')).toBeInTheDocument();
        });

        it('deve exibir ActionView ao selecionar a aba action', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            expect(screen.getByTestId('action-view')).toBeInTheDocument();
        });

        it('deve enviar request_yaml ao navegar para a aba action', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'request_yaml'});
        });

        it('deve voltar para DashboardView ao selecionar a aba dashboard', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-settings'));
            fireEvent.click(screen.getByTestId('tab-dashboard'));
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });
    });

    describe('mensagens da extensão', () => {
        it('deve carregar repos ao receber repos_loaded', () => {
            render(<App/>);
            act(() => {
                sendMessage({command: 'repos_loaded', repos: [{id: 1, name: 'repo-1'}, {id: 2, name: 'repo-2'}]});
            });
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });

        it('repos_loaded com selectedRepoPk seleciona o repositório detectado', () => {
            render(<App/>);
            act(() => {
                sendMessage({command: 'repos_loaded', repos: [{id: 1, name: 'a'}, {id: 2, name: 'b'}], selectedRepoPk: 2, detected: true});
            });
            expect(screen.getByTestId('sidebar').getAttribute('data-selected-repo')).toBe('2');
        });

        it('deve ativar scoreLoading ao receber score_loading', () => {
            render(<App/>);
            act(() => sendMessage({command: 'score_loading'}));
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });

        it('deve atualizar scoreData ao receber score_loaded', () => {
            render(<App/>);
            act(() => sendMessage({command: 'score_loaded', data: {score: 90, characteristics: []}}));
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });

        it('deve lidar com score_error sem quebrar', () => {
            render(<App/>);
            act(() => sendMessage({command: 'score_error', message: 'Falha na conexão'}));
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });

        it('deve navegar para output e limpar logs ao receber analysis_started', () => {
            render(<App/>);
            act(() => sendMessage({command: 'analysis_started'}));
            expect(screen.getByTestId('output-view')).toBeInTheDocument();
            expect(screen.getByTestId('output-view').getAttribute('data-lines')).toBe('0');
        });

        it('deve acumular linhas de log ao receber output_line', () => {
            render(<App/>);
            act(() => sendMessage({command: 'analysis_started'}));
            act(() => sendMessage({command: 'output_line', line: 'linha 1', isError: false}));
            act(() => sendMessage({command: 'output_line', line: 'linha 2', isError: true}));
            expect(screen.getByTestId('output-view').getAttribute('data-lines')).toBe('2');
        });

        it('deve permanecer na aba output após analysis_done com sucesso', async () => {
            vi.useFakeTimers();
            render(<App/>);
            act(() => sendMessage({command: 'analysis_started'}));
            act(() => sendMessage({command: 'analysis_done', success: true, exitCode: 0}));
            await act(async () => vi.advanceTimersByTime(600));
            expect(screen.getByTestId('output-view')).toBeInTheDocument();
            vi.useRealTimers();
        });

        it('deve permanecer na aba output se analysis_done falhar', async () => {
            vi.useFakeTimers();
            render(<App/>);
            act(() => sendMessage({command: 'analysis_started'}));
            act(() => sendMessage({command: 'analysis_done', success: false, exitCode: 1}));
            await act(async () => vi.advanceTimersByTime(600));
            expect(screen.getByTestId('output-view')).toBeInTheDocument();
            vi.useRealTimers();
        });

        it('deve parar execução ao receber analysis_stopped', () => {
            render(<App/>);
            act(() => sendMessage({command: 'analysis_started'}));
            act(() => sendMessage({command: 'analysis_stopped'}));
            expect(screen.getByTestId('output-view')).toBeInTheDocument();
        });

        it('deve atualizar yaml ao receber yaml_loaded', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            act(() => sendMessage({command: 'yaml_loaded', yaml: 'novo-yaml'}));
            expect(screen.getByTestId('action-view')).toBeInTheDocument();
        });

        it('deve exibir feedback de action_saved por 3s e depois sumir', async () => {
            vi.useFakeTimers();
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            act(() => sendMessage({command: 'action_saved'}));
            expect(screen.getByTestId('action-feedback')).toBeInTheDocument();
            await act(async () => vi.advanceTimersByTime(3000));
            expect(screen.queryByTestId('action-feedback')).not.toBeInTheDocument();
            vi.useRealTimers();
        });

        it('deve exibir feedback de settings_saved por 3s e depois sumir', async () => {
            vi.useFakeTimers();
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-settings'));
            act(() => sendMessage({command: 'settings_saved'}));
            expect(screen.getByTestId('settings-feedback')).toBeInTheDocument();
            await act(async () => vi.advanceTimersByTime(3000));
            expect(screen.queryByTestId('settings-feedback')).not.toBeInTheDocument();
            vi.useRealTimers();
        });

        it('deve atualizar settings ao receber settings_loaded', () => {
            render(<App/>);
            act(() => sendMessage({command: 'settings_loaded', data: {productName: 'Produto X'}}));
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });

        it('deve remover o listener de mensagens ao desmontar', () => {
            const removeSpy = vi.spyOn(window, 'removeEventListener');
            const {unmount} = render(<App/>);
            unmount();
            expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
        });
    });

    describe('estado não configurado (US1)', () => {
        it('deve trocar o dashboard pela NotConfiguredView ao receber not_configured', () => {
            render(<App/>);
            act(() => sendMessage({command: 'not_configured', missing: ['token']}));
            expect(screen.getByTestId('not-configured')).toBeInTheDocument();
            expect(screen.getByTestId('not-configured').getAttribute('data-missing')).toBe('token');
            expect(screen.queryByTestId('dashboard-view')).not.toBeInTheDocument();
        });

        it('"Abrir Settings" na NotConfiguredView leva para a aba settings', () => {
            render(<App/>);
            act(() => sendMessage({command: 'not_configured', missing: ['token']}));
            fireEvent.click(screen.getByTestId('nc-open-settings'));
            expect(screen.getByTestId('settings-view')).toBeInTheDocument();
        });

        it('"settings.json" envia open_vscode_settings', () => {
            render(<App/>);
            act(() => sendMessage({command: 'not_configured', missing: ['token']}));
            fireEvent.click(screen.getByTestId('nc-open-json'));
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'open_vscode_settings'});
        });

        it('volta ao dashboard quando score_loading chega depois de not_configured', () => {
            render(<App/>);
            act(() => sendMessage({command: 'not_configured', missing: ['token']}));
            act(() => sendMessage({command: 'score_loading'}));
            expect(screen.getByTestId('dashboard-view')).toBeInTheDocument();
        });
    });

    describe('organizações, erros e retry (US1)', () => {
        it('passa as organizações e a selecionada para a Sidebar ao receber orgs_loaded', () => {
            render(<App/>);
            act(() => sendMessage({command: 'orgs_loaded', organizations: [{id: 10, name: 'a'}, {id: 11, name: 'b'}], selectedOrgPk: 10}));
            const sb = screen.getByTestId('sidebar');
            expect(sb.getAttribute('data-orgs')).toBe('2');
            expect(sb.getAttribute('data-selected-org')).toBe('10');
        });

        it('envia select_org ao escolher outra organização', () => {
            render(<App/>);
            act(() => sendMessage({command: 'orgs_loaded', organizations: [{id: 10, name: 'a'}, {id: 11, name: 'b'}], selectedOrgPk: 10}));
            fireEvent.click(screen.getByTestId('select-org'));
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'select_org', orgPk: 11});
        });

        it('score_error com kind timeout mostra a mensagem como erro', () => {
            render(<App/>);
            act(() => sendMessage({command: 'score_error', message: 'O serviço não respondeu em 15 s.', kind: 'timeout'}));
            const dv = screen.getByTestId('dashboard-view');
            expect(dv.getAttribute('data-notif')).toBe('O serviço não respondeu em 15 s.');
            expect(dv.getAttribute('data-notif-type')).toBe('error');
        });

        it('"Tentar de novo" envia retry', () => {
            render(<App/>);
            act(() => sendMessage({command: 'score_error', message: 'x', kind: 'unavailable'}));
            fireEvent.click(screen.getByTestId('retry'));
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'retry'});
        });
    });

    describe('execução local (US5)', () => {
        it('analysis_blocked chega na ActionView e desliga running', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            act(() => sendMessage({command: 'analysis_started'}));
            fireEvent.click(screen.getByTestId('tab-action'));
            act(() => sendMessage({command: 'analysis_blocked', reason: 'docker_missing'}));
            expect(screen.getByTestId('action-view').getAttribute('data-blocked')).toBe('docker_missing');
            expect(screen.queryByTestId('action-running')).not.toBeInTheDocument();
        });

        it('um novo run_action limpa o bloqueio anterior', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            act(() => sendMessage({command: 'analysis_blocked', reason: 'docker_stopped'}));
            fireEvent.click(screen.getByTestId('action-run'));
            expect(screen.getByTestId('action-view').getAttribute('data-blocked')).toBe('');
        });

        it('"Parar" envia stop_analysis', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            fireEvent.click(screen.getByTestId('action-stop'));
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'stop_analysis'});
        });

        it('analysis_stopped registra "interrompida" na saída', () => {
            render(<App/>);
            act(() => sendMessage({command: 'analysis_started'}));
            act(() => sendMessage({command: 'analysis_stopped'}));
            expect(screen.getByTestId('output-view').getAttribute('data-lines')).toBe('1');
        });
    });

    describe('ações do usuário', () => {
        it('deve enviar save_settings ao salvar configurações', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-settings'));
            fireEvent.click(screen.getByTestId('settings-save'));
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({command: 'save_settings'}),
            );
        });

        it('deve enviar save_action com yaml mesclado ao salvar action', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            fireEvent.click(screen.getByTestId('action-save'));
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'save_action', yaml: 'yaml-merged'});
        });

        it('deve enviar run_action quando settings estão completos', () => {
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            fireEvent.click(screen.getByTestId('action-run'));
            expect(mockPostMessage).toHaveBeenCalledWith({command: 'run_action', yaml: 'yaml-merged'});
        });

        it('deve exibir alerta e enviar show_warning quando settings estão incompletos', () => {
            mockGetMissingSettings.mockReturnValueOnce([{label: 'GitHub Token', field: 'githubToken'}]);
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            fireEvent.click(screen.getByTestId('action-run'));
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({command: 'show_warning'}),
            );
            expect(screen.getByTestId('action-alert')).toBeInTheDocument();
        });

        it('não deve enviar run_action quando settings estão incompletos', () => {
            mockGetMissingSettings.mockReturnValueOnce([{label: 'GitHub Token', field: 'githubToken'}]);
            render(<App/>);
            fireEvent.click(screen.getByTestId('tab-action'));
            fireEvent.click(screen.getByTestId('action-run'));
            expect(mockPostMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({command: 'run_action'}),
            );
        });
    });
});