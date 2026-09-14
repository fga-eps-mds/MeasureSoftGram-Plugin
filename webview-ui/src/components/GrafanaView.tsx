import React from 'react';
import type { GrafanaDashboard } from '../types';

interface GrafanaViewProps {
  dashboards: GrafanaDashboard[];
  loading: boolean;
  iframeUrl: string | null;
  iframeTitle: string | null;
  error: string | null;
  hasContext: boolean;
  onSelectDashboard: (uid: string) => void;
  onBack: () => void;
}

export const GrafanaView: React.FC<GrafanaViewProps> = ({
  dashboards,
  loading,
  iframeUrl,
  iframeTitle,
  error,
  hasContext,
  onSelectDashboard,
  onBack,
}) => {
  const showList  = !loading && !iframeUrl;
  const showFrame = !loading && !!iframeUrl;

  return (
    <div className="vw on" id="view-grafana">

      <div className="view-header">
        <div>
          <div className="view-title">
            <i className="ti ti-chart-area" style={{ color: '#2B4D6F', fontSize: 16 }} />
            <span>Grafana Dashboards</span>
          </div>
          <div className="view-sub">
            {iframeUrl
              ? iframeTitle
              : hasContext
                ? 'Selecione um dashboard para visualizar'
                : 'Carregue o produto no Painel primeiro'}
          </div>
        </div>
        {showFrame && (
          <button className="btn sec" onClick={onBack}>
            <i className="ti ti-arrow-left" /> Voltar
          </button>
        )}
      </div>

      {loading && (
        <div className="notif" style={{ marginBottom: 14 }}>
          <i className="ti ti-loader run-anim" />
          <span>Carregando...</span>
        </div>
      )}

      {error && (
        <div className="notif warn-n" style={{ marginBottom: 12 }}>
          <i className="ti ti-alert-circle" style={{ color: '#D13310' }} />
          <span>{error}</span>
        </div>
      )}

      {!hasContext && !loading && (
        <div className="notif warn-n">
          <i className="ti ti-info-circle" />
          <span>
            Nenhum produto carregado. Abra a aba <strong>Painel</strong> e aguarde o
            carregamento das métricas antes de acessar os dashboards.
          </span>
        </div>
      )}

      {showList && hasContext && dashboards.length === 0 && !error && (
        <div className="notif">
          <i className="ti ti-info-circle" />
          <span>Nenhum dashboard encontrado no Grafana.</span>
        </div>
      )}

      {showList && hasContext && dashboards.length > 0 && (
        <div id="grafana-dashboard-list">
          {dashboards.map((d) => (
            <button
              key={d.uid}
              type="button"
              className="grafana-card"
              onClick={() => onSelectDashboard(d.uid)}
            >
              <i
                className="ti ti-chart-bar grafana-card-icon"
                aria-hidden="true"
              />
              <span className="grafana-card-info">
                <span className="grafana-card-title">{d.title}</span>
                {d.has_repo_selector && (
                  <span className="grafana-card-sub">
                    <i className="ti ti-git-branch" aria-hidden="true" />
                    {' '}filtrado por repositório
                  </span>
                )}
              </span>
              <i
                className="ti ti-chevron-right grafana-card-arrow"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      )}

      {showFrame && (
        <iframe
          src={iframeUrl!}
          className="grafana-iframe"
          title={iframeTitle ?? 'Grafana Dashboard'}
          frameBorder="0"
          allowFullScreen
        />
      )}

    </div>
  );
};
