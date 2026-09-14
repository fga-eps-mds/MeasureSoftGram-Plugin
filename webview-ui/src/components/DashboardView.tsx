import React from 'react';
import type {ScoreData} from '../types';
import {getCharStatus} from '../utils/helpers';

interface DashboardViewProps {
    scoreData: ScoreData | null;
    scoreLoading: boolean;
    productName: string;
    showCommitWarn: boolean;
    notifText: string;
    notifType: 'ok' | 'error';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
                                                                scoreData,
                                                                scoreLoading,
                                                                productName,
                                                                showCommitWarn,
                                                                notifText,
                                                                notifType,
                                                            }) => {
    const score = scoreData?.score ?? 0;
    const scorePct = (score * 100).toFixed(0);
    const avgGoal = scoreData?.characteristics.length
        ? scoreData.characteristics.reduce((s, c) => s + c.goal, 0) / scoreData.characteristics.length
        : 0.7;

    const worstChar = scoreData?.characteristics.length
        ? scoreData.characteristics.reduce(
            (worst, c) =>
                c.value - c.goal < worst.value - worst.goal ? c : worst,
            scoreData.characteristics[0],
        )
        : undefined;

    const productLabel = productName || 'sem produto configurado';

    let metaStatus: React.ReactNode = '—';
    if (scoreData) {
        metaStatus = score >= avgGoal
            ? <span className="ok">acima ✓</span>
            : <span className="fail">abaixo ✗</span>;
    }

    return (
        <div className="vw on" id="view-dashboard">
            {/* Header */}
            <div className="view-header">
                <div>
                    <div className="view-title">
                        <i className="ti ti-chart-radar" style={{color: '#2B4D6F', fontSize: 16}}/>
                        <span>MeasureSoftGram</span>
                    </div>
                    <div className="view-sub">
                        {productLabel} · última análise: agora mesmo
                    </div>
                </div>
            </div>

            {/* Loading state */}
            {scoreLoading && (
                <div className="notif" style={{marginBottom: 14}}>
                    <i className="ti ti-loader run-anim"/>
                    <span>Carregando dados do produto...</span>
                </div>
            )}

            {/* No data warning */}
            {!scoreLoading && scoreData?.noData && (
                <div className="notif warn-n" id="notif-no-data">
                    <i className="ti ti-alert-circle" style={{color: '#DF8E16'}}/>
                    <span>
            Este repositório ainda não possui métricas calculadas no MeasureSoftGram.
            Execute uma análise completa para gerar os dados.
          </span>
                </div>
            )}

            {/* Commit warning */}
            {!scoreLoading && showCommitWarn && worstChar && (
                <div className="commit-warn show" id="commit-warn">
                    <div className="cw-title">
                        <i className="ti ti-git-commit"/> Atenção antes do commit
                    </div>
                    <div className="cw-desc">
                        Verfique se rodou a análise MSGRAM nesta sessão. Commitar sem analisar pode
                        introduzir regressão em{' '}
                        <strong style={{color: '#DF8E16'}}>{worstChar.name}</strong> — última nota{' '}
                        {worstChar.value.toFixed(2)}, próxima da meta {worstChar.goal.toFixed(2)}.
                    </div>
                </div>
            )}

            {/* Notification */}
            {notifText && (
                <div className={`notif${notifType === 'error' ? ' warn-n' : ''}`} id="notif-ok">
                    <i
                        className={`ti ${notifType === 'error' ? 'ti-alert-circle' : 'ti-circle-check'}`}
                        style={notifType === 'error' ? {color: '#D13310'} : undefined}
                    />
                    <span>{notifText}</span>
                </div>
            )}

            {/* Score hero */}
            {!scoreLoading && (
                <div className="score-hero">
                    <div className="hero-num" id="hero-score">
                        {scoreData ? score.toFixed(2) : '—'}
                    </div>
                    <div className="hero-right">
                        <div className="hero-lbl">TSQMI do produto</div>
                        <div className="hero-bar">
                            <div
                                className="hero-fill"
                                id="hero-fill"
                                style={{width: `${scorePct}%`}}
                            />
                        </div>
                        <div className="hero-meta">
                            meta da release: {avgGoal.toFixed(2)} ·{' '}
                            {metaStatus}
                        </div>
                    </div>
                </div>
            )}

            <div id="chars-dashboard">
                {scoreData?.characteristics.map((c) => {
                    const status = getCharStatus(c.value, c.goal);
                    const mark = c.value >= c.goal ? '✓' : '~';
                    return (
                        <div
                            key={c.name}
                            className="char-row"
                            style={status === 'warn' ? {borderColor: '#DF8E1633'} : undefined}
                        >
                            <i className={`ti ti-chart-dots char-icon ${status}`}/>
                            <span className="char-name">{c.name}</span>
                            <span className={`char-val ${status}`}>{c.value.toFixed(2)}</span>
                            <span className="char-goal">
                meta {c.goal.toFixed(2)} {mark}
              </span>
                        </div>
                    );
                })}
            </div>

        </div>
    );
};
