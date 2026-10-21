/**
 * Cliente HTTP mínimo sobre node:http/https com tempo limite e erros
 * classificados. Toda chamada ao serviço MeasureSoftGram passa por aqui.
 */
import * as http from 'node:http';
import * as https from 'node:https';
import type {ScoreErrorKind} from '../panels/messages';

export type HttpErrorKind = ScoreErrorKind;

export class HttpError extends Error {
  constructor(
      message: string,
      public readonly kind: HttpErrorKind,
      public readonly status?: number,
      public readonly body?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  token?: string;
  body?: unknown;
  /** padrão 15000 */
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

const UNAVAILABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE']);

export function kindFromStatus(status: number): HttpErrorKind {
  if (status === 401 || status === 403) {
    return 'auth';
  }
  if (status === 404) {
    return 'not_found';
  }
  if (status >= 500) {
    return 'unavailable';
  }
  return 'other';
}

function kindFromNetworkError(err: NodeJS.ErrnoException): HttpErrorKind {
  return err.code && UNAVAILABLE_CODES.has(err.code) ? 'unavailable' : 'other';
}

export function request<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const {method = 'GET', token, body, timeoutMs = DEFAULT_TIMEOUT_MS} = opts;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new HttpError(`URL inválida: ${url}`, 'other'));
  }
  const client = parsed.protocol === 'https:' ? https : http;

  const headers: Record<string, string> = {Accept: 'application/json'};
  if (token) {
    headers.Authorization = `Token ${token}`;
  }
  let payload: string | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(payload));
  }

  return new Promise<T>((resolve, reject) => {
    const req = client.request(parsed, {method, headers}, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (raw += chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status >= 400) {
          reject(new HttpError(`HTTP ${status}: ${raw.slice(0, 500)}`, kindFromStatus(status), status, raw));
          return;
        }
        if (!raw.trim()) {
          resolve(undefined as unknown as T);
          return;
        }
        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new HttpError(`Resposta não é JSON: ${raw.slice(0, 200)}`, 'other', status, raw));
        }
      });
      res.on('error', (err) => reject(new HttpError(err.message, 'other', res.statusCode)));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new HttpError(`O serviço não respondeu em ${Math.round(timeoutMs / 1000)} s.`, 'timeout'));
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof HttpError) {
        reject(err);
      } else {
        reject(new HttpError(err.message, kindFromNetworkError(err)));
      }
    });

    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

interface Page<T> {
  results: T[];
  next: string | null;
}

const MAX_PAGES = 100;

/**
 * Segue a paginação do Django REST Framework (`{results, next}`) até
 * `next` ser nulo. Uma resposta que já é um array é devolvida como está.
 */
export async function getAll<T>(url: string, opts: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = url;
  let pages = 0;

  while (nextUrl && pages < MAX_PAGES) {
    const page: Page<T> | T[] = await request<Page<T> | T[]>(nextUrl, opts);
    pages += 1;
    if (Array.isArray(page)) {
      items.push(...page);
      break;
    }
    items.push(...(page.results ?? []));
    nextUrl = page.next ?? null;
  }

  return items;
}
