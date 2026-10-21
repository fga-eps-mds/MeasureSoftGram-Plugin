import {fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Sidebar} from '../../components/Sidebar';
import type {RepoItem, ScoreData} from '../../types';

vi.mock('../../../utils/helpers', () => ({
    getCharStatus: vi.fn(() => 'ok'),
    getStatusColor: vi.fn(() => '#04724D'),
    escHtml: vi.fn((t: string) => t),
    now: vi.fn(() => '00:00:00'),
}));

const REPOS: RepoItem[] = [
    {id: 1, name: 'repo-alpha'},
    {id: 2, name: 'repo-beta'},
];

const SCORE_DATA: ScoreData = {
    score: 0.87,
    noData: false,
    lastAnalysisAt: '2026-10-01T00:00:00Z',
    hasGoal: true,
    characteristics: [
        { key: 'reliability', name: 'Reliability', value: 0.9, goal: 0.8, measuredAt: '2026-10-01T00:00:00Z' },
        { key: 'maintainability', name: 'Maintainability', value: 0.75, goal: 0.85, measuredAt: '2026-10-01T00:00:00Z' },
    ],
};

const DEFAULT_PROPS = {
    scoreData: null,
    scoreLoading: false,
    scoreError: false,
    repos: [],
    selectedRepoPk: null,
    onSelectRepo: vi.fn(),
    activeTab: 'dashboard' as const,
    onShowTab: vi.fn(),
};

describe('Sidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('branding', () => {
        it('deve exibir o nome "MeasureSoftGram"', () => {
            render(<Sidebar {...DEFAULT_PROPS}/>);
            expect(screen.getByText('MeasureSoftGram')).toBeInTheDocument();
        });

        it('deve exibir o subtítulo de análise multidimensional', () => {
            render(<Sidebar {...DEFAULT_PROPS}/>);
            expect(screen.getByText(/Análise multidimensional/)).toBeInTheDocument();
        });

        it('deve exibir o rótulo "TSQMI" no lugar do rótulo antigo "Nota do Produto"', () => {
            render(<Sidebar {...DEFAULT_PROPS}/>);
            expect(screen.getAllByText('TSQMI').length).toBeGreaterThan(0);
            expect(screen.queryByText('Nota do Produto')).not.toBeInTheDocument();
        });
    });

    describe('seletor de repositório', () => {
        it('não deve renderizar o select quando não há repos', () => {
            render(<Sidebar {...DEFAULT_PROPS} repos={[]}/>);
            expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        });

        it('deve renderizar o select quando há repos', () => {
            render(<Sidebar {...DEFAULT_PROPS} repos={REPOS}/>);
            expect(screen.getByRole('combobox')).toBeInTheDocument();
        });

        it('deve renderizar uma option para cada repo', () => {
            render(<Sidebar {...DEFAULT_PROPS} repos={REPOS}/>);
            expect(screen.getByRole('option', {name: 'repo-alpha'})).toBeInTheDocument();
            expect(screen.getByRole('option', {name: 'repo-beta'})).toBeInTheDocument();
        });

        it('deve refletir o repo selecionado no valor do select', () => {
            render(<Sidebar {...DEFAULT_PROPS} repos={REPOS} selectedRepoPk={2}/>);
            expect(screen.getByRole('combobox')).toHaveValue('2');
        });

        it('deve chamar onSelectRepo com o id correto ao mudar seleção', () => {
            const onSelectRepo = vi.fn();
            render(<Sidebar {...DEFAULT_PROPS} repos={REPOS} onSelectRepo={onSelectRepo}/>);
            fireEvent.change(screen.getByRole('combobox'), {target: {value: '2'}});
            expect(onSelectRepo).toHaveBeenCalledWith(2);
        });

        it('deve exibir "produto não encontrado" e desabilitar option quando scoreError', () => {
            render(<Sidebar {...DEFAULT_PROPS} repos={REPOS} scoreError={true}/>);
            const option = screen.getByRole('option', {name: 'produto não encontrado'});
            expect(option).toBeDisabled();
        });

        it('deve usar value vazio no select quando scoreError', () => {
            render(<Sidebar {...DEFAULT_PROPS} repos={REPOS} scoreError={true} selectedRepoPk={1}/>);
            expect(screen.getByRole('combobox')).toHaveValue('');
        });
    });

    describe('score', () => {
        it('deve exibir ícone de loading no score-box quando scoreLoading', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreLoading={true}/>);
            const scoreBox = document.getElementById('sb-score')!;
            expect(scoreBox.querySelector('.codicon-loading')).toBeInTheDocument();
        });

        it('deve exibir o score formatado quando há dados', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA}/>);
            expect(document.getElementById('sb-score')).toHaveTextContent('0.87');
        });

        it('deve exibir "—" quando não há dados e não está carregando', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={null} scoreLoading={false}/>);
            expect(document.getElementById('sb-score')).toHaveTextContent('—');
        });

        it('deve exibir aviso de métricas não calculadas quando noData', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={{...SCORE_DATA, noData: true}}/>);
            expect(screen.getByText(/Métricas ainda não calculadas/)).toBeInTheDocument();
        });

        it('não deve exibir aviso de noData quando scoreLoading', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={{...SCORE_DATA, noData: true}} scoreLoading={true}/>);
            expect(screen.queryByText(/Métricas ainda não calculadas/)).not.toBeInTheDocument();
        });
    });

    describe('status', () => {
        it('deve exibir "Conectado" quando há scoreData', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA}/>);
            expect(screen.getByText('Conectado')).toBeInTheDocument();
        });

        it('deve exibir "Sem dados" quando scoreData é null', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={null}/>);
            expect(screen.getByText('Sem dados')).toBeInTheDocument();
        });

        it('marca o dot como "on" quando há scoreData (cor vem do tema via CSS)', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA}/>);
            const dot = document.querySelector('.sdot') as HTMLElement;
            expect(dot).toHaveClass('on');
            expect(dot.getAttribute('style')).toBeNull();
        });

        it('marca o dot como "off" quando não há scoreData', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={null}/>);
            const dot = document.querySelector('.sdot') as HTMLElement;
            expect(dot).toHaveClass('off');
        });
    });

    describe('características', () => {
        it('deve exibir "carregando..." quando scoreLoading é true', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreLoading={true}/>);
            expect(screen.getByText(/carregando\.\.\./)).toBeInTheDocument();
        });

        it('deve exibir "carregando..." quando scoreData é null sem estar carregando', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={null} scoreLoading={false}/>);
            expect(screen.getByText(/carregando\.\.\./)).toBeInTheDocument();
        });

        it('deve exibir "nenhum dado disponível" quando noData', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={{score: 0, characteristics: [], noData: true, lastAnalysisAt: null, hasGoal: false}}/>);
            expect(screen.getByText('nenhum dado disponível')).toBeInTheDocument();
        });

        it('deve renderizar o nome de cada característica', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA}/>);
            expect(screen.getByText(/Reliability/)).toBeInTheDocument();
            expect(screen.getByText(/Maintainability/)).toBeInTheDocument();
        });

        it('deve exibir o valor formatado de cada característica', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA}/>);
            expect(screen.getByText('0.90')).toBeInTheDocument();
            expect(screen.getByText('0.75')).toBeInTheDocument();
        });

        it('deve chamar onShowTab com "dashboard" ao clicar em uma característica', () => {
            const onShowTab = vi.fn();
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA} onShowTab={onShowTab}/>);
            fireEvent.click(screen.getAllByText(/Reliability/)[0].closest('.mrow')!);
            expect(onShowTab).toHaveBeenCalledWith('dashboard');
        });

        it('deve renderizar a barra de progresso para cada característica', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA}/>);
            const fills = document.querySelectorAll('.barfill');
            expect(fills).toHaveLength(2);
        });

        it('deve aplicar a largura correta na barra de progresso', () => {
            render(<Sidebar {...DEFAULT_PROPS} scoreData={SCORE_DATA}/>);
            const fills = document.querySelectorAll('.barfill') as NodeListOf<HTMLElement>;
            expect(fills[0].style.width).toBe('90%');
            expect(fills[1].style.width).toBe('75%');
        });
    });
});