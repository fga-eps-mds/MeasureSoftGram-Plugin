import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {GrafanaView} from '../../components/GrafanaView';
import type {GrafanaDashboard} from '../../types';

const DASHBOARDS: GrafanaDashboard[] = [
    {uid: 'visao-geral', title: 'Visão Geral de Qualidade', description: '', tags: [], has_repo_selector: false},
    {uid: 'por-repo', title: 'Métricas por Repositório', description: '', tags: [], has_repo_selector: true},
];

const base = {
    dashboards: DASHBOARDS,
    loading: false,
    iframeUrl: null,
    iframeTitle: null,
    error: null,
    hasContext: true,
    onSelectDashboard: vi.fn(),
    onBack: vi.fn(),
};

describe('GrafanaView', () => {
    describe('lista de dashboards', () => {
        it('renderiza um cartão por dashboard', () => {
            render(<GrafanaView {...base} />);
            expect(screen.getByText('Visão Geral de Qualidade')).toBeInTheDocument();
            expect(screen.getByText('Métricas por Repositório')).toBeInTheDocument();
            expect(document.querySelectorAll('.grafana-card')).toHaveLength(2);
        });

        it('indica quais dashboards são filtrados por repositório', () => {
            render(<GrafanaView {...base} />);
            expect(screen.getAllByText(/filtrado por repositório/)).toHaveLength(1);
        });

        it('clicar em um cartão chama onSelectDashboard com o uid', () => {
            const onSelectDashboard = vi.fn();
            render(<GrafanaView {...base} onSelectDashboard={onSelectDashboard}/>);
            fireEvent.click(screen.getByText('Métricas por Repositório'));
            expect(onSelectDashboard).toHaveBeenCalledWith('por-repo');
        });

        it('mostra "Selecione um dashboard" no subtítulo', () => {
            render(<GrafanaView {...base} />);
            expect(screen.getByText(/Selecione um dashboard/)).toBeInTheDocument();
        });

        it('mostra aviso quando a lista está vazia', () => {
            render(<GrafanaView {...base} dashboards={[]}/>);
            expect(screen.getByText(/Nenhum dashboard encontrado/)).toBeInTheDocument();
        });
    });

    describe('estados', () => {
        it('mostra "Carregando..." e esconde a lista durante o loading', () => {
            render(<GrafanaView {...base} loading={true}/>);
            expect(screen.getByText(/Carregando/)).toBeInTheDocument();
            expect(document.querySelectorAll('.grafana-card')).toHaveLength(0);
        });

        it('mostra a mensagem de erro', () => {
            render(<GrafanaView {...base} error="Endereço do dashboard não permitido: x"/>);
            expect(screen.getByText(/não permitido/)).toBeInTheDocument();
        });

        it('sem contexto pede para abrir o Painel primeiro e não lista dashboards', () => {
            render(<GrafanaView {...base} hasContext={false}/>);
            expect(screen.getByText(/Carregue o produto no Painel primeiro/)).toBeInTheDocument();
            expect(screen.getByText(/Nenhum produto carregado/)).toBeInTheDocument();
            expect(document.querySelectorAll('.grafana-card')).toHaveLength(0);
        });
    });

    describe('iframe', () => {
        const withFrame = {...base, iframeUrl: 'https://grafana.example/d/abc?kiosk', iframeTitle: 'Visão Geral'};

        it('renderiza o iframe com src e title', () => {
            render(<GrafanaView {...withFrame} />);
            const frame = document.querySelector('iframe.grafana-iframe') as HTMLIFrameElement;
            expect(frame).toBeInTheDocument();
            expect(frame.getAttribute('src')).toBe('https://grafana.example/d/abc?kiosk');
            expect(frame.getAttribute('title')).toBe('Visão Geral');
        });

        it('mostra o título do dashboard no subtítulo e esconde a lista', () => {
            render(<GrafanaView {...withFrame} />);
            expect(screen.getByText('Visão Geral')).toBeInTheDocument();
            expect(document.querySelectorAll('.grafana-card')).toHaveLength(0);
        });

        it('botão Voltar chama onBack', () => {
            const onBack = vi.fn();
            render(<GrafanaView {...withFrame} onBack={onBack}/>);
            fireEvent.click(screen.getByRole('button', {name: /voltar/i}));
            expect(onBack).toHaveBeenCalledTimes(1);
        });

        it('iframe é isolado com sandbox e sem referrer (US4)', () => {
            render(<GrafanaView {...withFrame} />);
            const frame = document.querySelector('iframe.grafana-iframe') as HTMLIFrameElement;
            const sandbox = frame.getAttribute('sandbox') ?? '';
            expect(sandbox).toContain('allow-scripts');
            expect(sandbox).toContain('allow-same-origin');
            expect(sandbox).not.toContain('allow-top-navigation');
            expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
        });

        it('não renderiza iframe quando não há url', () => {
            render(<GrafanaView {...base} />);
            expect(document.querySelector('iframe')).not.toBeInTheDocument();
        });
    });
});
