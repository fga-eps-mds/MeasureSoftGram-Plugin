import * as assert from 'assert';
import * as http from 'node:http';
import {AddressInfo} from 'node:net';
import {
  fetchGrafanaDashboard,
  fetchGrafanaDashboards,
  fetchRepositories,
  fetchScoreForRepo,
  MsgramSettings,
} from '../../services/msgramApi';
import {HttpError} from '../../services/httpClient';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function mockServer(handler: Handler): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo;
      resolve({server, baseUrl: `http://127.0.0.1:${port}`});
    });
  });
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(data));
}

const MOCK_ORG = {id: 1, name: 'fga-eps-mds'};
const MOCK_PRODUCT = {id: 3, name: 'MeasureSoftGram'};
const MOCK_REPOS = [
  {id: 6, name: '2022-1-MeasureSoftGram-Service'},
  {id: 7, name: '2022-1-MeasureSoftGram-Core'},
];
const MOCK_TSQMI = {value: 0.9830292488408795};
const MOCK_CHARS = [
  {key: 'reliability', name: 'Reliability', latest: {value: 0.47, created_at: '2026-10-01T00:00:00Z'}},
  {key: 'maintainability', name: 'Maintainability', latest: {value: 0.99, created_at: '2026-10-01T00:00:00Z'}},
];

function createFullMockServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return mockServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/api/v1/organizations/') {
      return json(res, {count: 1, next: null, results: [MOCK_ORG]});
    }
    if (url === `/api/v1/organizations/${MOCK_ORG.id}/products/`) {
      return json(res, {count: 1, next: null, results: [MOCK_PRODUCT]});
    }
    if (url === `/api/v1/organizations/${MOCK_ORG.id}/products/${MOCK_PRODUCT.id}/repositories/`) {
      return json(res, {count: MOCK_REPOS.length, next: null, results: MOCK_REPOS});
    }
    if (url.endsWith('/current/goal/')) {
      return json(res, {id: 1, data: {reliability: 70, maintainability: 70}});
    }
    if (url.includes('latest-values/tsqmi')) {
      return json(res, url.includes('9999') ? {value: null} : MOCK_TSQMI);
    }
    if (url.includes('latest-values/characteristics')) {
      return json(res, {count: MOCK_CHARS.length, next: null, results: MOCK_CHARS});
    }
    json(res, {detail: 'Not found.'}, 404);
  });
}

const base = (baseUrl: string, extra: Partial<MsgramSettings> = {}): MsgramSettings =>
    ({serviceUrl: baseUrl, token: 'tok', productName: 'MeasureSoftGram', ...extra});

// ── fetchRepositories ─────────────────────────────────────────────────────────

suite('fetchRepositories', () => {
  test('sem token lança kind auth em vez de devolver dados de exemplo', async () => {
    const {server, baseUrl} = await mockServer((_req, res) => json(res, {detail: 'nope'}, 401));
    try {
      await assert.rejects(
          fetchRepositories(base(baseUrl, {token: ''})),
          (e: unknown) => e instanceof HttpError && e.kind === 'auth',
      );
    } finally {
      server.close();
    }
  });

  test('retorna organização e produto corretos', async () => {
    const {server, baseUrl} = await createFullMockServer();
    try {
      const result = await fetchRepositories(base(baseUrl));
      assert.strictEqual(result.orgPk, MOCK_ORG.id);
      assert.strictEqual(result.productPk, MOCK_PRODUCT.id);
      assert.strictEqual(result.repos.length, MOCK_REPOS.length);
      assert.deepStrictEqual(result.organizations, [MOCK_ORG]);
    } finally {
      server.close();
    }
  });

  test('lança erro quando nenhuma organização encontrada', async () => {
    const {server, baseUrl} = await mockServer((_req, res) => json(res, {count: 0, next: null, results: []}));
    try {
      await assert.rejects(fetchRepositories(base(baseUrl)), /Nenhuma organização encontrada/);
    } finally {
      server.close();
    }
  });

  test('lança erro quando produto não encontrado', async () => {
    const {server, baseUrl} = await mockServer((req, res) => {
      if (req.url === '/api/v1/organizations/') {
        return json(res, {count: 1, next: null, results: [MOCK_ORG]});
      }
      json(res, {count: 1, next: null, results: [{id: 99, name: 'OutroProduto'}]});
    });
    try {
      await assert.rejects(fetchRepositories(base(baseUrl)), /Produto "MeasureSoftGram" não encontrado/);
    } finally {
      server.close();
    }
  });
});

// ── fetchScoreForRepo ─────────────────────────────────────────────────────────

suite('fetchScoreForRepo', () => {
  test('retorna score e características corretos', async () => {
    const {server, baseUrl} = await createFullMockServer();
    try {
      const result = await fetchScoreForRepo(base(baseUrl), MOCK_ORG.id, MOCK_PRODUCT.id, 6, 'repo');
      assert.strictEqual(result.score, MOCK_TSQMI.value);
      assert.strictEqual(result.characteristics.length, MOCK_CHARS.length);
      assert.strictEqual(result.characteristics[0].goal, 0.7);
      assert.ok(!result.noData);
    } finally {
      server.close();
    }
  });

  test('retorna noData=true quando repositório sem TSQMI calculado', async () => {
    const {server, baseUrl} = await createFullMockServer();
    try {
      const result = await fetchScoreForRepo(base(baseUrl), MOCK_ORG.id, MOCK_PRODUCT.id, 9999, 'sem-dados');
      assert.strictEqual(result.noData, true);
      assert.strictEqual(result.score, 0);
    } finally {
      server.close();
    }
  });

  test('lança erro quando API retorna HTTP 401', async () => {
    const {server, baseUrl} = await mockServer((_req, res) => json(res, {detail: 'Não autenticado.'}, 401));
    try {
      await assert.rejects(fetchScoreForRepo(base(baseUrl, {token: 'invalido'}), 1, 1, 1, 'repo'), /HTTP 401/);
    } finally {
      server.close();
    }
  });
});

// ── fetchGrafanaDashboards ────────────────────────────────────────────────────

const MOCK_DASHBOARDS = [
  {uid: 'hierarquia-qualidade', title: 'Hierarquia de Qualidade', description: '', tags: ['measuresoftgram'], has_repo_selector: true},
  {uid: 'planejado-realizado', title: 'Planejado vs Realizado', description: '', tags: ['measuresoftgram'], has_repo_selector: false},
];

suite('fetchGrafanaDashboards', () => {
  test('retorna lista de dashboards', async () => {
    const {server, baseUrl} = await mockServer((req, res) => {
      if (req.url === '/api/v1/grafana/dashboards/') {
        return json(res, {count: MOCK_DASHBOARDS.length, next: null, results: MOCK_DASHBOARDS});
      }
      json(res, {detail: 'Not found.'}, 404);
    });
    try {
      const result = await fetchGrafanaDashboards(base(baseUrl));
      assert.strictEqual(result.length, MOCK_DASHBOARDS.length);
      assert.strictEqual(result[0].uid, 'hierarquia-qualidade');
      assert.strictEqual(result[0].has_repo_selector, true);
      assert.strictEqual(result[1].uid, 'planejado-realizado');
    } finally {
      server.close();
    }
  });

  test('retorna lista vazia quando não há dashboards', async () => {
    const {server, baseUrl} = await mockServer((_req, res) => json(res, {count: 0, next: null, results: []}));
    try {
      assert.strictEqual((await fetchGrafanaDashboards(base(baseUrl))).length, 0);
    } finally {
      server.close();
    }
  });

  test('lança erro quando API retorna HTTP 401', async () => {
    const {server, baseUrl} = await mockServer((_req, res) => json(res, {detail: 'Não autenticado.'}, 401));
    try {
      await assert.rejects(fetchGrafanaDashboards(base(baseUrl, {token: 'invalido'})), /HTTP 401/);
    } finally {
      server.close();
    }
  });
});

// ── fetchGrafanaDashboard ─────────────────────────────────────────────────────

const MOCK_DASHBOARD_DETAIL = {
  dashboard_uid: 'hierarquia-qualidade',
  title: 'Hierarquia de Qualidade',
  grafana_url: 'https://grafana.example/d/hierarquia-qualidade?orgId=1&var-product=3&kiosk',
  product_id: 3,
  repository: null,
};

suite('fetchGrafanaDashboard', () => {
  test('retorna detalhe do dashboard com product_id', async () => {
    const {server, baseUrl} = await mockServer((req, res) => {
      const url = new URL(req.url!, 'http://127.0.0.1');
      if (url.pathname === '/api/v1/grafana/dashboard/hierarquia-qualidade/' && url.searchParams.get('product_id') === '3') {
        return json(res, MOCK_DASHBOARD_DETAIL);
      }
      json(res, {detail: 'Not found.'}, 404);
    });
    try {
      const result = await fetchGrafanaDashboard(base(baseUrl), 'hierarquia-qualidade', 3);
      assert.strictEqual(result.dashboard_uid, 'hierarquia-qualidade');
      assert.strictEqual(result.product_id, 3);
      assert.strictEqual(result.repository, null);
    } finally {
      server.close();
    }
  });

  test('envia repository_id quando fornecido', async () => {
    const detail = {...MOCK_DASHBOARD_DETAIL, repository: {id: 6, name: 'Service'}};
    const {server, baseUrl} = await mockServer((req, res) => {
      const url = new URL(req.url!, 'http://127.0.0.1');
      if (url.pathname === '/api/v1/grafana/dashboard/hierarquia-qualidade/'
          && url.searchParams.get('product_id') === '3'
          && url.searchParams.get('repository_id') === '6') {
        return json(res, detail);
      }
      json(res, {detail: 'Not found.'}, 404);
    });
    try {
      const result = await fetchGrafanaDashboard(base(baseUrl), 'hierarquia-qualidade', 3, 6);
      assert.deepStrictEqual(result.repository, {id: 6, name: 'Service'});
    } finally {
      server.close();
    }
  });

  test('lança erro quando dashboard não encontrado', async () => {
    const {server, baseUrl} = await mockServer((_req, res) => json(res, {detail: 'Dashboard not found.'}, 404));
    try {
      await assert.rejects(fetchGrafanaDashboard(base(baseUrl), 'uid-inexistente', 3), /HTTP 404/);
    } finally {
      server.close();
    }
  });

  test('lança erro quando API retorna HTTP 403', async () => {
    const {server, baseUrl} = await mockServer((_req, res) => json(res, {detail: 'forbidden'}, 403));
    try {
      await assert.rejects(fetchGrafanaDashboard(base(baseUrl), 'hierarquia-qualidade', 999), /HTTP 403/);
    } finally {
      server.close();
    }
  });
});
