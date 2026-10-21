import * as assert from 'assert';
import * as http from 'node:http';
import {AddressInfo} from 'node:net';
import {getAll, HttpError, request} from '../../services/httpClient';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

function startServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
    return new Promise((resolve) => {
        const server = http.createServer(handler);
        server.listen(0, '127.0.0.1', () => {
            const {port} = server.address() as AddressInfo;
            resolve({
                url: `http://127.0.0.1:${port}`,
                close: () => new Promise((r) => server.close(() => r())),
            });
        });
    });
}

function json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
}

suite('services/httpClient — request', () => {
    test('GET devolve o JSON e envia o header Authorization', async () => {
        let seenAuth = '';
        const srv = await startServer((req, res) => {
            seenAuth = String(req.headers.authorization);
            json(res, 200, {ok: true});
        });
        try {
            const r = await request<{ ok: boolean }>(`${srv.url}/x`, {token: 'abc'});
            assert.deepStrictEqual(r, {ok: true});
            assert.strictEqual(seenAuth, 'Token abc');
        } finally {
            await srv.close();
        }
    });

    test('POST envia o body como JSON', async () => {
        let body = '';
        const srv = await startServer((req, res) => {
            req.on('data', (c) => (body += c));
            req.on('end', () => json(res, 201, {received: JSON.parse(body)}));
        });
        try {
            const r = await request<{ received: unknown }>(`${srv.url}/p`, {method: 'POST', body: {a: 1}});
            assert.deepStrictEqual(r, {received: {a: 1}});
        } finally {
            await srv.close();
        }
    });

    test('timeout dispara HttpError{kind:"timeout"}', async () => {
        const srv = await startServer(() => {
            /* nunca responde */
        });
        try {
            await assert.rejects(
                request(`${srv.url}/slow`, {timeoutMs: 100}),
                (e: unknown) => e instanceof HttpError && e.kind === 'timeout',
            );
        } finally {
            await srv.close();
        }
    });

    test('401 → kind "auth"', async () => {
        const srv = await startServer((_req, res) => json(res, 401, {detail: 'nope'}));
        try {
            await assert.rejects(
                request(`${srv.url}/a`),
                (e: unknown) => e instanceof HttpError && e.kind === 'auth' && e.status === 401,
            );
        } finally {
            await srv.close();
        }
    });

    test('404 → kind "not_found" com o body disponível', async () => {
        const srv = await startServer((_req, res) => json(res, 404, {detail: 'This product does not have a goal.'}));
        try {
            await assert.rejects(
                request(`${srv.url}/g`),
                (e: unknown) => e instanceof HttpError && e.kind === 'not_found' && String(e.body).includes('goal'),
            );
        } finally {
            await srv.close();
        }
    });

    test('502 → kind "unavailable"', async () => {
        const srv = await startServer((_req, res) => json(res, 502, {}));
        try {
            await assert.rejects(
                request(`${srv.url}/b`),
                (e: unknown) => e instanceof HttpError && e.kind === 'unavailable',
            );
        } finally {
            await srv.close();
        }
    });

    test('conexão recusada → kind "unavailable"', async () => {
        const srv = await startServer(() => {});
        const url = srv.url;
        await srv.close();
        await assert.rejects(
            request(`${url}/x`, {timeoutMs: 2000}),
            (e: unknown) => e instanceof HttpError && e.kind === 'unavailable',
        );
    });

    test('JSON inválido → kind "other"', async () => {
        const srv = await startServer((_req, res) => {
            res.writeHead(200);
            res.end('<html>');
        });
        try {
            await assert.rejects(
                request(`${srv.url}/h`),
                (e: unknown) => e instanceof HttpError && e.kind === 'other',
            );
        } finally {
            await srv.close();
        }
    });
});

suite('services/httpClient — getAll', () => {
    test('segue "next" até null e concatena results', async () => {
        const srv = await startServer((req, res) => {
            if (req.url === '/items/') {
                json(res, 200, {count: 3, next: `http://${req.headers.host}/items/?page=2`, results: [1, 2]});
            } else {
                json(res, 200, {count: 3, next: null, results: [3]});
            }
        });
        try {
            const all = await getAll<number>(`${srv.url}/items/`);
            assert.deepStrictEqual(all, [1, 2, 3]);
        } finally {
            await srv.close();
        }
    });

    test('resposta sem paginação (array direto) é devolvida como está', async () => {
        const srv = await startServer((_req, res) => json(res, 200, [7, 8]));
        try {
            assert.deepStrictEqual(await getAll<number>(`${srv.url}/arr/`), [7, 8]);
        } finally {
            await srv.close();
        }
    });
});
