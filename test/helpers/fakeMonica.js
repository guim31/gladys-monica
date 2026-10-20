// -----------------------------------------------------------------------------
// An in-memory Monica 4, answering the routes the integration calls the way
// the real server does: `{ data, links, meta }` pages of at most 100 items
// (`error_code` 30 beyond), `401 {"message":"Unauthenticated."}` for a wrong
// token, a 301 on `/api` itself. Its starting data are real answers of the
// official `monica:4` image in Docker (20/10/2026, test/fixtures/monica/
// real-*.json): nine contacts (two birthdays on 20 October, one on the 24th,
// one on the 26th without a year, one born on 29 February, one dead, one
// with only an age, one without a birthday) and eight reminders (three of
// them Monica's own birthday reminders).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/monica/${name}.json`, import.meta.url), 'utf8'));

// A made-up personal access token (a JWT in real life).
export const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.fake-monica-token.signature';

const json = (status, value) => ({
  status,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(value),
});

export class FakeMonica {
  constructor({ token = TOKEN } = {}) {
    this.token = token;
    this.me = structuredClone(fixture('real-me').data);
    this.contacts = structuredClone(fixture('real-contacts').data);
    this.reminders = structuredClone(fixture('real-reminders').data);
    this.online = true;
    /** Answer every API call with this status (e.g. 429, 500), when set. */
    this.failWith = null;
    this.requests = [];
  }

  contact(id) {
    return this.contacts.find((contact) => contact.id === id);
  }

  page(items, search, path) {
    const limit = Number(search.get('limit') ?? 15);
    if (limit > 100) {
      return json(400, { error: { message: 'The limit parameter is too big', error_code: 30 } });
    }
    const page = Math.max(1, Number(search.get('page')) || 1);
    const last = Math.max(1, Math.ceil(items.length / limit));
    return json(200, {
      data: items.slice((page - 1) * limit, page * limit),
      links: { first: `${path}?page=1`, last: `${path}?page=${last}` },
      meta: { current_page: page, last_page: last, per_page: limit, total: items.length },
    });
  }

  handle(url, options = {}) {
    const target = new URL(url);
    this.requests.push({ method: options.method ?? 'GET', path: target.pathname });
    if (!target.pathname.startsWith('/api/')) {
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<!DOCTYPE html><html><body>Monica</body></html>',
      };
    }
    const auth = options.headers?.authorization ?? '';
    if (auth !== `Bearer ${this.token}`) {
      return json(401, { message: 'Unauthenticated.' });
    }
    if (this.failWith) {
      return json(this.failWith, { message: 'Server Error' });
    }
    switch (target.pathname) {
      case '/api/me':
        return json(200, { data: this.me });
      case '/api/contacts':
        return this.page(this.contacts, target.searchParams, target.pathname);
      case '/api/reminders':
        return this.page(this.reminders, target.searchParams, target.pathname);
      default:
        return json(404, { error: { message: 'The resource has not been found', error_code: 31 } });
    }
  }
}

/** A fake network: base URL → server; anything else is refused. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options = {}) {
      const base = Object.keys(servers).find((origin) => url.startsWith(`${origin}/`));
      const server = base ? servers[base] : null;
      if (!server || !server.online) {
        const error = new Error('connect ECONNREFUSED');
        error.code = 'ECONNREFUSED';
        throw error;
      }
      return server.handle(url, options);
    },
  };
}
