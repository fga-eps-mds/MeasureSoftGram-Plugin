import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {DashboardView} from '../../components/DashboardView';
import type {ScoreData} from '../../types';

const NOW = new Date('2026-10-07T12:00:00Z');

const mockScoreData: ScoreData = {
    score: 0.82,
    noData: false,
    hasGoal: true,
    lastAnalysisAt: '2026-10-05T12:00:00Z',
    characteristics: [
        {key: 'maintainability', name: 'Maintainability', value: 0.85, goal: 0.80, measuredAt: '2026-10-05T12:00:00Z'},
        {key: 'reliability', name: 'Reliability', value: 0.60, goal: 0.75, measuredAt: '2026-10-05T12:00:00Z'},
        {key: 'performance', name: 'Performance', value: 0.90, goal: 0.70, measuredAt: '2026-10-05T12:00:00Z'},
    ],
};

const defaultProps = {
    scoreData: mockScoreData,
    scoreLoading: false,
    productName: 'My Product',
    notifText: '',
    notifType: 'ok' as const,
    now: NOW,
};

describe('DashboardView', () => {
    describe('header', () => {
        it('deve renderizar o título MeasureSoftGram', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText(/MeasureSoftGram/i)).toBeInTheDocument();
        });

        it('deve exibir o nome do produto no subtítulo', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText(/My Product/)).toBeInTheDocument();
        });

        it('deve exibir "sem produto configurado" quando productName é vazio', () => {
            render(<DashboardView {...defaultProps} productName=""/>);
            expect(screen.getByText(/sem produto configurado/)).toBeInTheDocument();
        });

        it('deve exibir a última análise como tempo relativo a partir de lastAnalysisAt', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText(/última análise: há 2 dias/)).toBeInTheDocument();
        });

        it('deve mostrar a data absoluta no tooltip da última análise', () => {
            render(<DashboardView {...defaultProps} />);
            const el = screen.getByText(/há 2 dias/);
            expect(el).toHaveAttribute('title', expect.stringMatching(/2026/));
        });

        it('deve exibir "nunca analisado" quando lastAnalysisAt é null', () => {
            render(<DashboardView {...defaultProps} scoreData={{...mockScoreData, lastAnalysisAt: null}}/>);
            expect(screen.getByText(/nunca analisado/)).toBeInTheDocument();
        });

        it('nunca exibe o texto fixo "agora mesmo"', () => {
            const {container} = render(<DashboardView {...defaultProps} />);
            expect(container.textContent).not.toMatch(/agora mesmo/);
        });
    });

    describe('loading state', () => {
        it('deve exibir spinner quando scoreLoading é true', () => {
            render(<DashboardView {...defaultProps} scoreLoading={true}/>);
            expect(screen.getByText(/Carregando dados do produto/i)).toBeInTheDocument();
        });

        it('não deve exibir o score hero durante o loading', () => {
            render(<DashboardView {...defaultProps} scoreLoading={true}/>);
            expect(screen.queryByText('0.82')).not.toBeInTheDocument();
        });
    });

    describe('no data warning', () => {
        it('deve exibir aviso quando scoreData.noData é true', () => {
            render(<DashboardView {...defaultProps} scoreData={{...mockScoreData, noData: true}}/>);
            expect(screen.getByText(/ainda não possui métricas calculadas/i)).toBeInTheDocument();
        });

        it('não deve exibir aviso quando noData é false', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.queryByText(/ainda não possui métricas calculadas/i)).not.toBeInTheDocument();
        });
    });

    describe('aviso de característica abaixo da meta', () => {
        it('deve exibir o aviso com a característica mais distante da meta', () => {
            render(<DashboardView {...defaultProps} />);
            const warn = document.getElementById('goal-warn');
            expect(warn).toBeInTheDocument();
            expect(warn).toHaveTextContent('Reliability');
        });

        it('não deve mencionar commit', () => {
            const {container} = render(<DashboardView {...defaultProps} />);
            expect(container.textContent).not.toMatch(/commit/i);
        });

        it('não deve exibir quando todas estão acima da meta', () => {
            const ok = {
                ...mockScoreData,
                characteristics: mockScoreData.characteristics.map((c) => ({...c, value: 0.99})),
            };
            render(<DashboardView {...defaultProps} scoreData={ok}/>);
            expect(document.getElementById('goal-warn')).not.toBeInTheDocument();
        });

        it('não deve exibir quando o produto não tem meta', () => {
            const noGoal = {
                ...mockScoreData,
                hasGoal: false,
                characteristics: mockScoreData.characteristics.map((c) => ({...c, goal: null})),
            };
            render(<DashboardView {...defaultProps} scoreData={noGoal}/>);
            expect(document.getElementById('goal-warn')).not.toBeInTheDocument();
        });

        it('não deve exibir quando scoreData é null', () => {
            render(<DashboardView {...defaultProps} scoreData={null}/>);
            expect(document.getElementById('goal-warn')).not.toBeInTheDocument();
        });
    });

    describe('meta', () => {
        it('deve exibir "sem meta definida" quando hasGoal é false', () => {
            const noGoal = {
                ...mockScoreData,
                hasGoal: false,
                characteristics: mockScoreData.characteristics.map((c) => ({...c, goal: null})),
            };
            render(<DashboardView {...defaultProps} scoreData={noGoal}/>);
            expect(screen.getByText(/sem meta definida/i)).toBeInTheDocument();
        });

        it('deve exibir "acima ✓" quando score >= meta média', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText(/acima ✓/i)).toBeInTheDocument();
        });

        it('deve exibir "abaixo ✗" quando score < meta média', () => {
            render(<DashboardView {...defaultProps} scoreData={{...mockScoreData, score: 0.5}}/>);
            expect(screen.getByText(/abaixo ✗/i)).toBeInTheDocument();
        });
    });

    describe('notificação e erro', () => {
        it('deve exibir notificação de sucesso quando notifText está presente', () => {
            render(<DashboardView {...defaultProps} notifText="Análise concluída!" notifType="ok"/>);
            expect(screen.getByText('Análise concluída!')).toBeInTheDocument();
        });

        it('deve exibir notificação de erro quando notifType é error', () => {
            render(<DashboardView {...defaultProps} notifText="Falha na análise" notifType="error"/>);
            expect(screen.getByText('Falha na análise')).toBeInTheDocument();
        });

        it('deve exibir "Tentar de novo" em erro e chamar onRetry', () => {
            const onRetry = vi.fn();
            render(<DashboardView {...defaultProps} scoreData={null} notifText="Serviço indisponível" notifType="error" onRetry={onRetry}/>);
            fireEvent.click(screen.getByRole('button', {name: /tentar de novo/i}));
            expect(onRetry).toHaveBeenCalledTimes(1);
        });

        it('não deve exibir "Tentar de novo" quando não há erro', () => {
            render(<DashboardView {...defaultProps} onRetry={() => {}}/>);
            expect(screen.queryByRole('button', {name: /tentar de novo/i})).not.toBeInTheDocument();
        });
    });

    describe('score hero', () => {
        it('deve exibir o score formatado com 2 casas decimais', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText('0.82')).toBeInTheDocument();
        });

        it('deve exibir "—" quando scoreData é null', () => {
            render(<DashboardView {...defaultProps} scoreData={null}/>);
            expect(screen.getAllByText('—').length).toBeGreaterThan(0);
        });
    });

    describe('lista de características', () => {
        it('deve renderizar todas as características na lista', () => {
            render(<DashboardView {...defaultProps} />);
            const list = document.getElementById('chars-dashboard')!;
            const names = Array.from(list.querySelectorAll('.char-name')).map((e) => e.textContent);
            expect(names).toEqual(['Maintainability', 'Reliability', 'Performance']);
        });

        it('deve exibir certo para características acima da meta', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getAllByText(/meta.*✓/)).toHaveLength(2);
        });

        it('deve exibir til para características abaixo da meta', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getAllByText(/meta.*~/)).toHaveLength(1);
        });

        it('deve exibir "meta —" para característica sem meta', () => {
            const partial = {
                ...mockScoreData,
                characteristics: [{...mockScoreData.characteristics[0], goal: null}],
            };
            render(<DashboardView {...defaultProps} scoreData={partial}/>);
            expect(screen.getByText(/meta —/)).toBeInTheDocument();
        });

        it('não deve renderizar características quando scoreData é null', () => {
            render(<DashboardView {...defaultProps} scoreData={null}/>);
            expect(screen.queryByText('Maintainability')).not.toBeInTheDocument();
        });
    });
});
