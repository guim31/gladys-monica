// -----------------------------------------------------------------------------
// Monica 4 API client: the three read-only calls the integration needs, on
// `/api`, authenticated by a personal access token (Settings → API → Personal
// access tokens) in the `Authorization: Bearer` header. Checked against a real
// Monica 4 (official `monica:4` image + MariaDB) in Docker, October 2026.
//
//   GET /api/me                          the token's user (and its account id)
//   GET /api/contacts?limit=100&page=N   Contact[], paginated (`meta.last_page`)
//   GET /api/reminders?limit=100&page=N  Reminder[], paginated
//
// Pitfalls found on the real server:
//   - `limit` above 100 is refused (`error_code` 30): pages of 100;
//   - 60 requests per minute per token (`X-RateLimit-Limit`), then 429;
//   - a wrong token gets `401 {"message":"Unauthenticated."}` only with
//     `Accept: application/json`; without it, a redirect to the login page;
//   - `/api` without a trailing path answers a 301 to itself.
// Monica 5 ("chandler") has no such API: the integration targets Monica 4.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify (self-signed without the option)
  AUTH: 'auth', // missing, wrong, expired or revoked token
  NOT_MONICA: 'not_monica', // something answers, but not the Monica 4 API
  REDIRECT: 'redirect', // HTTP redirected to HTTPS, or a login portal
  RATE_LIMIT: 'rate_limit', // 429: the server's request limit
  HTTP: 'http', // any other unexpected answer
});

export class MonicaError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'MonicaError';
    this.kind = kind;
    this.status = status;
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

const PAGE_SIZE = 100;
// 50 pages: 5,000 contacts, within the 60 requests a minute.
const MAX_PAGES = 50;

function networkError(err) {
  if (TLS_CODES.has(err.code)) {
    return new MonicaError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
  }
  return new MonicaError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
}

export class MonicaClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, without trailing slash
   * @param {string} options.token personal access token
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {Function} [options.request] HTTP seam (src/monica/http.js)
   */
  constructor({ url, token, insecure = false, request = httpRequest }) {
    this.url = url;
    this.token = token;
    this.insecure = insecure;
    this.request = request;
  }

  async call(path) {
    let response;
    try {
      response = await this.request(`${this.url}/api${path}`, {
        insecure: this.insecure,
        headers: { authorization: `Bearer ${this.token}` },
        timeoutMs: 20_000,
      });
    } catch (err) {
      throw networkError(err);
    }
    const { status, body } = response;
    let parsed;
    let parsedOk = true;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsedOk = false;
    }
    // The server's own message, short; it never echoes the token.
    const message = parsed?.error?.message ?? parsed?.message;
    const said = parsedOk && typeof message === 'string' ? ` ${message.slice(0, 200)}` : '';
    if (status === 401 || status === 403) {
      throw new MonicaError(ERROR_KINDS.AUTH, `HTTP ${status}${said}`, status);
    }
    if (status === 429) {
      throw new MonicaError(ERROR_KINDS.RATE_LIMIT, 'HTTP 429', status);
    }
    if (status >= 300 && status < 400) {
      throw new MonicaError(ERROR_KINDS.REDIRECT, `HTTP ${status}`, status);
    }
    if (!parsedOk) {
      throw new MonicaError(
        status === 200 || status === 404 ? ERROR_KINDS.NOT_MONICA : ERROR_KINDS.HTTP,
        `HTTP ${status}, not JSON`,
        status,
      );
    }
    if (status === 404) {
      throw new MonicaError(ERROR_KINDS.NOT_MONICA, `HTTP 404${said}`, status);
    }
    if (status < 200 || status >= 300) {
      throw new MonicaError(ERROR_KINDS.HTTP, `HTTP ${status}${said}`, status);
    }
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) {
      throw new MonicaError(ERROR_KINDS.NOT_MONICA, `HTTP ${status}, no "data"`, status);
    }
    return parsed;
  }

  /** Every page of a list. */
  async all(path) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const answer = await this.call(`${path}?limit=${PAGE_SIZE}&page=${page}`);
      if (!Array.isArray(answer.data)) {
        throw new MonicaError(ERROR_KINDS.NOT_MONICA, `${path}: "data" is not a list`, 200);
      }
      items.push(...answer.data);
      const last = Number(answer.meta?.last_page);
      if (!Number.isFinite(last) || page >= last || answer.data.length === 0) {
        break;
      }
    }
    // Offset pages are not stable: an item created meanwhile may come twice.
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item?.id)) {
        return false;
      }
      seen.add(item?.id);
      return true;
    });
  }

  /** The user of the token: `{ id, account: { id }, … }`. */
  async me() {
    const { data } = await this.call('/me');
    if (!data || !Number.isInteger(data.account?.id)) {
      throw new MonicaError(ERROR_KINDS.NOT_MONICA, '/me: no account', 200);
    }
    return data;
  }

  contacts() {
    return this.all('/contacts');
  }

  reminders() {
    return this.all('/reminders');
  }
}
