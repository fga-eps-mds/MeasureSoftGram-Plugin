/**
 * Testes de contrato: sobem um servidor HTTP local que responde às oito
 * rotas de specs/001-fix-diagnostico-2026-2/contracts/msgram-api.md nos
 * formatos reais do MeasureSoftGram-Service, e verificam como o cliente
 * interpreta cada uma.
 */
import * as assert from 'assert';
import * as http from 'node:http';
import {AddressInfo} from 'node:net';
import {createProduct, createRepository, discoverRepository, fetchGoals, fetchRepositories, fetchScoreForRepo, listProducts, MsgramSettings} from '../../services/msgramApi';
import {HttpError} from '../../services/httpClient';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

interface Fixture {
  orgs?: { id: number; name: string }[];
  products?: { id: number; name: string }[];
  repos?: { id: number; name: string }[];
  /** repositórios por produto (id) — para a descoberta; tem prioridade sobre `repos` */
  reposByProduct?: Record<number, { id: number; name: string }[]>;
  /** página 1 devolve metade dos repos e aponta para a página 2 */
  paginateRepos?: boolean;
  paginateOrgs?: boolean;
  goal?: Record<string, number> | null;
  tsqmi?: number | null;
  chars?: { key: string; name: string; latest: { value: number; created_at: string } | null }[];
  status?: { orgs?: number };
}

const DEFAULT_CHARS = [
  {key: 'reliability', name: 'Reliability', latest: {value: 0.47, created_at: '2026-09-30T10:00:00Z'}},
  {key: 'maintainability', name: 'Maintainability', latest: {value: 0.99, created_at: '2026-10-02T12:30:00Z'}},
  {key: 'functional_suitability', name: 'Functional Suitability', latest: null},
];

function startServer(fx: Fixture): Promise<{ baseUrl: string; close: () => Promise<void>; hits: string[]; posted: { path: string; body: any }[] }> {
  const hits: string[] = [];
  const posted: { path: string; body: any }[] = [];
  const orgs = fx.orgs ?? [{id: 1, name: 'fga-eps-mds'}];
  const products = fx.products ?? [{id: 3, name: 'MeasureSoftGram'}];
  const repos = fx.repos ?? [{id: 6, name: 'Service'}, {id: 7, name: 'Core'}];
  const chars = fx.chars ?? DEFAULT_CHARS;

  const handler: Handler = (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const p = url.pathname;
    const host = `http://${req.headers.host}`;
    hits.push(p + url.search);

    const json = (status: number, body: unknown) => {
      res.writeHead(status, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(body));
    };

    if (!req.headers.authorization) {
      return json(401, {detail: 'Authentication credentials were not provided.'});
    }

    if (p === '/api/v1/organizations/') {
      if (fx.status?.orgs) {
        return json(fx.status.orgs, {detail: 'erro'});
      }
      if (fx.paginateOrgs && orgs.length > 1) {
        const page = Number(url.searchParams.get('page') ?? '1');
        const half = Math.ceil(orgs.length / 2);
        return page === 1
            ? json(200, {count: orgs.length, next: `${host}${p}?page=2`, previous: null, results: orgs.slice(0, half)})
            : json(200, {count: orgs.length, next: null, previous: `${host}${p}`, results: orgs.slice(half)});
      }
      return json(200, {count: orgs.length, next: null, previous: null, results: orgs});
    }

    const mProducts = p.match(/^\/api\/v1\/organizations\/(\d+)\/products\/$/);
    if (mProducts && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { posted.push({path: p, body: JSON.parse(body)}); json(201, {id: 77, name: JSON.parse(body).name, description: ''}); });
      return;
    }
    const mReposPost = p.match(/^\/api\/v1\/organizations\/(\d+)\/products\/(\d+)\/repositories\/$/);
    if (mReposPost && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { posted.push({path: p, body: JSON.parse(body)}); json(201, {id: 555, name: JSON.parse(body).name}); });
      return;
    }
    if (mProducts) {
      return json(200, {count: products.length, next: null, previous: null, results: products});
    }

    const mRepos = p.match(/^\/api\/v1\/organizations\/(\d+)\/products\/(\d+)\/repositories\/$/);
    if (mRepos && fx.reposByProduct) {
      const list = fx.reposByProduct[Number(mRepos[2])] ?? [];
      return json(200, {count: list.length, next: null, previous: null, results: list});
    }
    if (mRepos) {
      if (fx.paginateRepos && repos.length > 1) {
        const page = Number(url.searchParams.get('page') ?? '1');
        const half = Math.ceil(repos.length / 2);
        return page === 1
            ? json(200, {count: repos.length, next: `${host}${p}?page=2`, previous: null, results: repos.slice(0, half)})
            : json(200, {count: repos.length, next: null, previous: `${host}${p}`, results: repos.slice(half)});
      }
      return json(200, {count: repos.length, next: null, previous: null, results: repos});
    }

    if (/^\/api\/v1\/organizations\/\d+\/products\/\d+\/current\/goal\/$/.test(p)) {
      if (fx.goal === null) {
        return json(404, {detail: 'This product does not have a goal.', actions: {}});
      }
      return json(200, {id: 1, created_by: 'luiza', data: fx.goal ?? {reliability: 80, maintainability: 75}, created_at: '2026-09-01T00:00:00Z'});
    }

    if (/latest-values\/tsqmi\/$/.test(p)) {
      return json(200, {id: 10, value: fx.tsqmi === undefined ? 0.8731 : fx.tsqmi, created_at: '2026-10-02T12:30:00Z'});
    }

    if (/latest-values\/characteristics\/$/.test(p)) {
      return json(200, {count: chars.length, next: null, previous: null, results: chars});
    }

    json(404, {detail: 'Not found.'});
  };

  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        hits,
        posted,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function settings(baseUrl: string, extra: Partial<MsgramSettings> = {}): MsgramSettings {
  return {serviceUrl: baseUrl, token: 'tok', productName: 'measuresoftgram', requestTimeoutMs: 2000, ...extra};
}

suite('msgramApi contrato — fetchRepositories', () => {
  test('percorre todas as páginas de organizações e repositórios', async () => {
    const srv = await startServer({
      orgs: [{id: 1, name: 'a'}, {id: 2, name: 'b'}, {id: 3, name: 'c'}],
      repos: [{id: 1, name: 'r1'}, {id: 2, name: 'r2'}, {id: 3, name: 'r3'}],
      paginateOrgs: true,
      paginateRepos: true,
    });
    try {
      const ctx = await fetchRepositories(settings(srv.baseUrl));
      assert.deepStrictEqual(ctx.organizations.map((o) => o.id), [1, 2, 3]);
      assert.deepStrictEqual(ctx.repos.map((r) => r.id), [1, 2, 3]);
      assert.ok(srv.hits.some((h) => h.includes('/repositories/?page=2')), 'buscou a página 2 de repositórios');
      assert.ok(srv.hits.some((h) => h.includes('/organizations/?page=2')), 'buscou a página 2 de organizações');
    } finally {
      await srv.close();
    }
  });

  test('encontra o produto ignorando maiúsculas e espaços', async () => {
    const srv = await startServer({products: [{id: 9, name: '  MeasureSoftGram '}]});
    try {
      const ctx = await fetchRepositories(settings(srv.baseUrl, {productName: 'measuresoftgram'}));
      assert.strictEqual(ctx.productPk, 9);
      assert.strictEqual(ctx.productName, 'MeasureSoftGram');
    } finally {
      await srv.close();
    }
  });

  test('usa a primeira organização quando organizationName está vazio', async () => {
    const srv = await startServer({orgs: [{id: 5, name: 'primeira'}, {id: 6, name: 'segunda'}]});
    try {
      const ctx = await fetchRepositories(settings(srv.baseUrl));
      assert.strictEqual(ctx.orgPk, 5);
      assert.strictEqual(ctx.orgName, 'primeira');
    } finally {
      await srv.close();
    }
  });

  test('seleciona a organização por organizationName', async () => {
    const srv = await startServer({orgs: [{id: 5, name: 'primeira'}, {id: 6, name: 'Segunda'}]});
    try {
      const ctx = await fetchRepositories(settings(srv.baseUrl, {organizationName: 'segunda'}));
      assert.strictEqual(ctx.orgPk, 6);
      assert.ok(srv.hits.some((h) => h.startsWith('/api/v1/organizations/6/products/')));
    } finally {
      await srv.close();
    }
  });

  test('organizationPk escolhe a organização certa mesmo com nomes repetidos', async () => {
    const srv = await startServer({orgs: [{id: 5, name: 'Luiza Maluf'}, {id: 6, name: 'Luiza Maluf'}]});
    try {
      const ctx = await fetchRepositories(settings(srv.baseUrl, {organizationPk: 6}));
      assert.strictEqual(ctx.orgPk, 6);
      assert.ok(srv.hits.some((h) => h.startsWith('/api/v1/organizations/6/products/')));
    } finally {
      await srv.close();
    }
  });

  test('produto inexistente lança not_found listando os disponíveis', async () => {
    const srv = await startServer({products: [{id: 1, name: 'Alpha'}, {id: 2, name: 'Beta'}]});
    try {
      await assert.rejects(
          fetchRepositories(settings(srv.baseUrl, {productName: 'Gamma'})),
          (e: unknown) => e instanceof HttpError && e.kind === 'not_found' && /Alpha/.test(e.message) && /Beta/.test(e.message),
      );
    } finally {
      await srv.close();
    }
  });

  test('token inválido lança kind auth', async () => {
    const srv = await startServer({});
    try {
      await assert.rejects(
          fetchRepositories(settings(srv.baseUrl, {token: ''})),
          (e: unknown) => e instanceof HttpError && e.kind === 'auth',
      );
    } finally {
      await srv.close();
    }
  });

  test('serviço fora do ar lança kind unavailable', async () => {
    const srv = await startServer({status: {orgs: 502}});
    try {
      await assert.rejects(
          fetchRepositories(settings(srv.baseUrl)),
          (e: unknown) => e instanceof HttpError && e.kind === 'unavailable',
      );
    } finally {
      await srv.close();
    }
  });
});

suite('msgramApi contrato — fetchGoals', () => {
  test('converte as metas de 0–100 para 0–1', async () => {
    const srv = await startServer({goal: {reliability: 80, maintainability: 75}});
    try {
      const goals = await fetchGoals(settings(srv.baseUrl), 1, 3);
      assert.ok(goals);
      assert.strictEqual(goals!.get('reliability'), 0.8);
      assert.strictEqual(goals!.get('maintainability'), 0.75);
    } finally {
      await srv.close();
    }
  });

  test('404 "does not have a goal" devolve null em vez de lançar', async () => {
    const srv = await startServer({goal: null});
    try {
      assert.strictEqual(await fetchGoals(settings(srv.baseUrl), 1, 3), null);
    } finally {
      await srv.close();
    }
  });
});

suite('msgramApi contrato — fetchScoreForRepo', () => {
  test('monta ScoreData com key, meta, data de medição e última análise', async () => {
    const srv = await startServer({goal: {reliability: 80}});
    try {
      const data = await fetchScoreForRepo(settings(srv.baseUrl), 1, 3, 6, 'Service');
      assert.strictEqual(data.score, 0.8731);
      assert.strictEqual(data.noData, false);
      assert.strictEqual(data.hasGoal, true);
      assert.strictEqual(data.characteristics.length, 2, 'característica sem latest é omitida');
      const rel = data.characteristics.find((c) => c.key === 'reliability')!;
      assert.strictEqual(rel.name, 'Reliability');
      assert.strictEqual(rel.value, 0.47);
      assert.strictEqual(rel.goal, 0.8);
      assert.strictEqual(rel.measuredAt, '2026-09-30T10:00:00Z');
      const maint = data.characteristics.find((c) => c.key === 'maintainability')!;
      assert.strictEqual(maint.goal, null, 'sem meta para esta característica');
      assert.strictEqual(data.lastAnalysisAt, '2026-10-02T12:30:00Z', 'maior created_at');
    } finally {
      await srv.close();
    }
  });

  test('sem meta no produto: hasGoal false e goal null em todas', async () => {
    const srv = await startServer({goal: null});
    try {
      const data = await fetchScoreForRepo(settings(srv.baseUrl), 1, 3, 6, 'Service');
      assert.strictEqual(data.hasGoal, false);
      assert.ok(data.characteristics.every((c) => c.goal === null));
    } finally {
      await srv.close();
    }
  });

  test('tsqmi null devolve noData sem características', async () => {
    const srv = await startServer({tsqmi: null});
    try {
      const data = await fetchScoreForRepo(settings(srv.baseUrl), 1, 3, 6, 'Service');
      assert.strictEqual(data.noData, true);
      assert.strictEqual(data.score, 0);
      assert.deepStrictEqual(data.characteristics, []);
      assert.strictEqual(data.lastAnalysisAt, null);
    } finally {
      await srv.close();
    }
  });

  test('respeita requestTimeoutMs', async () => {
    const server = http.createServer(() => { /* nunca responde */ });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const {port} = server.address() as AddressInfo;
    try {
      await assert.rejects(
          fetchScoreForRepo(settings(`http://127.0.0.1:${port}`, {requestTimeoutMs: 100}), 1, 3, 6, 'x'),
          (e: unknown) => e instanceof HttpError && e.kind === 'timeout',
      );
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});

suite('msgramApi contrato — discoverRepository', () => {
  test('acha o repositório da pasta aberta em outro produto, percorrendo organizações e produtos', async () => {
    const srv = await startServer({
      orgs: [{id: 1, name: 'EPS/MDS'}, {id: 2, name: 'Luiza Maluf'}],
      products: [{id: 10, name: 'Measure'}, {id: 20, name: 'Integracao'}],
      reposByProduct: {10: [{id: 100, name: 'Service'}], 20: [{id: 200, name: 'Integracao-de-Dados'}]},
    });
    try {
      const found = await discoverRepository(settings(srv.baseUrl), {remoteName: 'Integracao-de-Dados'});
      assert.ok(found);
      assert.strictEqual(found!.repo.id, 200);
      assert.strictEqual(found!.productName, 'Integracao');
      assert.strictEqual(found!.orgPk, 1, 'primeira organização onde o produto existe');
      assert.ok(srv.hits.some((h) => h.includes('/products/10/repositories/')), 'olhou o produto anterior antes');
    } finally {
      await srv.close();
    }
  });

  test('devolve null quando nada casa, e null sem pistas (sem chamar a API)', async () => {
    const srv = await startServer({reposByProduct: {3: [{id: 1, name: 'x'}]}});
    try {
      assert.strictEqual(await discoverRepository(settings(srv.baseUrl), {folderName: 'nada-a-ver'}), null);
      const before = srv.hits.length;
      assert.strictEqual(await discoverRepository(settings(srv.baseUrl), {}), null);
      assert.strictEqual(srv.hits.length, before);
    } finally {
      await srv.close();
    }
  });
});

suite('msgramApi contrato — cadastro', () => {
  test('listProducts, createProduct e createRepository usam as rotas e os campos do Service', async () => {
    const srv = await startServer({products: [{id: 10, name: ' Measure '}]});
    try {
      const products = await listProducts(settings(srv.baseUrl), 1);
      assert.deepStrictEqual(products, [{id: 10, name: 'Measure'}]);

      const product = await createProduct(settings(srv.baseUrl), 1, {name: 'Novo'});
      assert.deepStrictEqual(product, {id: 77, name: 'Novo'});
      assert.deepStrictEqual(srv.posted[0], {path: '/api/v1/organizations/1/products/', body: {name: 'Novo', description: ''}});

      const repo = await createRepository(settings(srv.baseUrl), 1, 77, {name: 'meu-repo', url: 'https://github.com/x/meu-repo', description: 'd'});
      assert.deepStrictEqual(repo, {id: 555, name: 'meu-repo'});
      assert.deepStrictEqual(srv.posted[1], {
        path: '/api/v1/organizations/1/products/77/repositories/',
        body: {name: 'meu-repo', url: 'https://github.com/x/meu-repo', description: 'd', platform: 'github'},
      });
    } finally {
      await srv.close();
    }
  });
});
