import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardView } from '../../components/DashboardView';
import type { ScoreData } from '../../types';

const mockScoreData: ScoreData = {
    score: 0.82,
    noData: false,
    characteristics: [
        { name: 'Maintainability', value: 0.85, goal: 0.80 },
        { name: 'Reliability', value: 0.60, goal: 0.75 },
        { name: 'Performance', value: 0.90, goal: 0.70 },
    ],
};

const defaultProps = {
    scoreData: mockScoreData,
    scoreLoading: false,
    productName: 'My Product',
    showCommitWarn: false,
    notifText: '',
    notifType: 'ok' as const,
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
            render(<DashboardView {...defaultProps} productName="" />);
            expect(screen.getByText(/sem produto configurado/)).toBeInTheDocument();
        });
    });

    describe('loading state', () => {
        it('deve exibir spinner quando scoreLoading é true', () => {
            render(<DashboardView {...defaultProps} scoreLoading={true} />);
            expect(screen.getByText(/Carregando dados do produto/i)).toBeInTheDocument();
        });

        it('não deve exibir spinner quando scoreLoading é false', () => {
            render(<DashboardView {...defaultProps} scoreLoading={false} />);
            expect(screen.queryByText(/Carregando dados do produto/i)).not.toBeInTheDocument();
        });

        it('não deve exibir o score hero durante o loading', () => {
            render(<DashboardView {...defaultProps} scoreLoading={true} />);
            expect(screen.queryByText('0.82')).not.toBeInTheDocument();
        });
    });

    describe('no data warning', () => {
        it('deve exibir aviso quando scoreData.noData é true', () => {
            const noDataScore = { ...mockScoreData, noData: true };
            render(<DashboardView {...defaultProps} scoreData={noDataScore} />);
            expect(screen.getByText(/ainda não possui métricas calculadas/i)).toBeInTheDocument();
        });

        it('não deve exibir aviso quando noData é false', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.queryByText(/ainda não possui métricas calculadas/i)).not.toBeInTheDocument();
        });
    });

    describe('commit warning', () => {
        it('não deve exibir aviso de commit quando a lista de características é vazia', () => {
            const scoreData = { ...mockScoreData, characteristics: [] };
            render(<DashboardView {...defaultProps} scoreData={scoreData} showCommitWarn={true} />);

            expect(document.getElementById('commit-warn')).not.toBeInTheDocument();
        });

        it('deve exibir a única característica no aviso de commit', () => {
            const scoreData = {
                ...mockScoreData,
                characteristics: [{ name: 'Reliability', value: 0.60, goal: 0.75 }],
            };
            render(<DashboardView {...defaultProps} scoreData={scoreData} showCommitWarn={true} />);

            expect(document.getElementById('commit-warn')).toHaveTextContent('Reliability');
        });

        it('deve escolher pela menor diferença para a meta entre várias características', () => {
            const scoreData = {
                ...mockScoreData,
                characteristics: [
                    { name: 'Maintainability', value: 0.40, goal: 0.45 },
                    { name: 'Reliability', value: 0.60, goal: 0.90 },
                    { name: 'Performance', value: 0.80, goal: 0.70 },
                ],
            };
            render(<DashboardView {...defaultProps} scoreData={scoreData} showCommitWarn={true} />);

            expect(document.getElementById('commit-warn')).toHaveTextContent('Reliability');
        });

        it('deve exibir aviso de commit com a pior característica', () => {
            render(<DashboardView {...defaultProps} showCommitWarn={true} />);

            const commitWarn = document.getElementById('commit-warn');
            expect(commitWarn).toBeInTheDocument();
            expect(commitWarn).toHaveTextContent('Reliability');
        });

        it('não deve exibir aviso de commit quando showCommitWarn é false', () => {
            render(<DashboardView {...defaultProps} showCommitWarn={false} />);
            expect(screen.queryByText(/Atenção antes do commit/i)).not.toBeInTheDocument();
        });

        it('não deve exibir aviso de commit quando scoreData é null', () => {
            render(<DashboardView {...defaultProps} scoreData={null} showCommitWarn={true} />);
            expect(screen.queryByText(/Atenção antes do commit/i)).not.toBeInTheDocument();
        });
    });

    describe('notificação', () => {
        it('deve exibir notificação de sucesso quando notifText está presente', () => {
            render(<DashboardView {...defaultProps} notifText="Análise concluída!" notifType="ok" />);
            expect(screen.getByText('Análise concluída!')).toBeInTheDocument();
        });

        it('deve exibir notificação de erro quando notifType é error', () => {
            render(<DashboardView {...defaultProps} notifText="Falha na análise" notifType="error" />);
            expect(screen.getByText('Falha na análise')).toBeInTheDocument();
        });

        it('não deve exibir notificação quando notifText é vazio', () => {
            render(<DashboardView {...defaultProps} notifText="" />);
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
        });
    });

    describe('score hero', () => {
        it('deve exibir o score formatado com 2 casas decimais', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText('0.82')).toBeInTheDocument();
        });

        it('deve exibir "—" quando scoreData é null', () => {
            render(<DashboardView {...defaultProps} scoreData={null} />);
            expect(screen.getByText('—')).toBeInTheDocument();
        });

        it('deve exibir status "acima" quando score >= avgGoal', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText(/acima ✓/i)).toBeInTheDocument();
        });

        it('deve exibir status "abaixo" quando score < avgGoal', () => {
            const lowScore = { ...mockScoreData, score: 0.50 };
            render(<DashboardView {...defaultProps} scoreData={lowScore} />);
            expect(screen.getByText(/abaixo ✗/i)).toBeInTheDocument();
        });

        it('deve exibir "—" como metaStatus quando scoreData é null', () => {
            render(<DashboardView {...defaultProps} scoreData={null} />);
            expect(screen.getByText('—')).toBeInTheDocument();
        });
    });

    describe('lista de características', () => {
        it('deve renderizar todas as características', () => {
            render(<DashboardView {...defaultProps} />);
            expect(screen.getByText('Maintainability')).toBeInTheDocument();
            expect(screen.getByText('Reliability')).toBeInTheDocument();
            expect(screen.getByText('Performance')).toBeInTheDocument();
        });

        it('deve exibir certo para características acima da meta', () => {
            render(<DashboardView {...defaultProps} />);
            const checks = screen.getAllByText(/meta.*✓/);
            expect(checks).toHaveLength(2);
        });

        it('deve exibir errado para características abaixo da meta', () => {
            render(<DashboardView {...defaultProps} />);
            const tildes = screen.getAllByText(/meta.*~/);
            expect(tildes).toHaveLength(1);
        });

        it('não deve renderizar características quando scoreData é null', () => {
            render(<DashboardView {...defaultProps} scoreData={null} />);
            expect(screen.queryByText('Maintainability')).not.toBeInTheDocument();
        });
    });
});
