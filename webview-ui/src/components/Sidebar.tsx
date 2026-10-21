import React from 'react';
import type {OrgItem, RepoItem, ScoreData, TabName} from '../types';
import {getCharStatus} from '../utils/helpers';

interface SidebarProps {
    scoreData: ScoreData | null;
    scoreLoading: boolean;
    scoreError: boolean;
    repos: RepoItem[];
    selectedRepoPk: number | null;
    onSelectRepo: (repoPk: number) => void;
    activeTab: TabName;
    onShowTab: (tab: TabName) => void;
    organizations?: OrgItem[];
    selectedOrgPk?: number | null;
    onSelectOrg?: (orgPk: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
                                                    scoreData,
                                                    scoreLoading,
                                                    scoreError,
                                                    repos,
                                                    selectedRepoPk,
                                                    onSelectRepo,
                                                    onShowTab,
                                                    organizations = [],
                                                    selectedOrgPk = null,
                                                    onSelectOrg,
                                                }) => {
    const renderCharsContent = (): React.ReactNode => {
        if (scoreLoading || !scoreData) {
            return (
                <div className="srow muted">
                    <i className="codicon codicon-loading codicon-modifier-spin run-anim" aria-hidden="true"/>
                    <span className="stxt">carregando...</span>
                </div>
            );
        }
        if (scoreData.noData) {
            return (
                <div className="srow muted">
                    <i className="codicon codicon-circle-slash" aria-hidden="true"/>
                    <span className="stxt">nenhum dado disponível</span>
                </div>
            );
        }
        return scoreData.characteristics.map((c) => {
            const status = getCharStatus(c.value, c.goal);
            return (
                <React.Fragment key={c.key}>
                    <div className="mrow" onClick={() => onShowTab('dashboard')}>
                        <div className="mn">
                            <i className={`codicon codicon-circle-filled ${status}`} aria-hidden="true"/> {c.name}
                        </div>
                        <span className={`mv ${status}`}>{c.value.toFixed(2)}</span>
                    </div>
                    <div className="bar">
                        <div className="barbg">
                            <div className={`barfill ${status}`} style={{width: `${(c.value * 100).toFixed(0)}%`}}/>
                        </div>
                    </div>
                </React.Fragment>
            );
        });
    };

    return (
        <div className="sh">
            {/* Header com branding */}
            <div className="brand-box">
                <div className="brand-title">MeasureSoftGram</div>
                <div className="brand-sub">Análise multidimensional da qualidade de software</div>
            </div>

            {/* Seletor de organização: só quando a conta tem mais de uma */}
            {organizations.length > 1 && (
                <div className="sblock">
                    <div className="slbl">
                        <i className="codicon codicon-organization" aria-hidden="true"/> Organização
                    </div>
                    <select
                        id="org-select"
                        className="sselect"
                        value={selectedOrgPk ?? ''}
                        onChange={(e) => onSelectOrg?.(Number(e.target.value))}
                    >
                        {organizations.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Seletor de repositório */}
            {repos.length > 0 && (
                <div className="sblock">
                    <div className="slbl">
                        <i className="codicon codicon-repo" aria-hidden="true"/> Repositório
                    </div>
                    <select
                        id="repo-select"
                        className={`sselect${scoreError ? ' err' : ''}`}
                        value={scoreError ? '' : (selectedRepoPk ?? '')}
                        onChange={(e) => onSelectRepo(Number(e.target.value))}
                    >
                        {scoreError
                            ? <option value="" disabled>produto não encontrado</option>
                            : repos.map((r) => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))
                        }
                    </select>
                </div>
            )}

            <div className="sblock">
                <div className="sec-title">
                    <i className="codicon codicon-star-full" aria-hidden="true"/> TSQMI
                </div>

                <div className="score-box">
                    <div className="score-num" id="sb-score">
                        {scoreLoading ? (
                            <i className="codicon codicon-loading codicon-modifier-spin run-anim" aria-hidden="true"/>
                        ) : scoreData ? (
                            scoreData.score.toFixed(2)
                        ) : (
                            '—'
                        )}
                    </div>
                    <div className="score-lbl">TSQMI</div>
                </div>

                {!scoreLoading && scoreData?.noData && (
                    <div className="notif warn-n compact">
                        <i className="codicon codicon-warning" aria-hidden="true"/>
                        <span>Métricas ainda não calculadas para este repositório.</span>
                    </div>
                )}

                <div className="sec-title">
                    <i className="codicon codicon-graph" aria-hidden="true"/> Características
                </div>

                <div id="chars-sidebar">
                    {renderCharsContent()}
                </div>

                <div className="divider"/>

                <div className="sec-title">
                    <i className="codicon codicon-info" aria-hidden="true"/> Status
                </div>
                <div className="srow">
                    <div className={`sdot ${scoreData ? 'on' : 'off'}`}/>
                    <span className="stxt strong">{scoreData ? 'Conectado' : 'Sem dados'}</span>
                </div>
            </div>
        </div>
    );
};
