// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Monica 4 instance (its address and a personal access token of one of
// its users), read on a timer of the container.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in minutes.
export const POLL_INTERVALS = ['15', '30', '60', '180', '360'];

// Local hour at which the scene events of the day fire.
export const EVENT_HOURS = Array.from({ length: 24 }, (_, hour) => String(hour));

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  allow_self_signed: false,
  poll_interval: '60',
  event_hour: '8',
  language: 'fr',
};

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10:8080`), or a URL copied from the browser
 * (`https://monica.example.org/people/h:abc`). HTTP by default. A path prefix
 * is kept (Monica behind a reverse proxy under `/monica`), the API path and
 * the known screens of the web app are dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/prefix]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  const path = url.pathname
    .replace(/\/api(\/.*)?$/, '')
    .replace(
      /\/(dashboard|people|journal|settings|login|register|activities|tasks|compliance)(\/.*)?$/,
      '',
    )
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

const bool = (value) => value === true || value === 'true';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const poll = String(source.poll_interval ?? '');
  const hour = String(source.event_hour ?? '');
  return {
    url: parseServerUrl(typed),
    urlTyped: typed !== '',
    // Tokens are kept as typed, minus the blanks (and a pasted "Bearer ") around them.
    token:
      typeof source.api_token === 'string'
        ? source.api_token.trim().replace(/^Bearer\s+/i, '')
        : '',
    allowSelfSigned: bool(source.allow_self_signed),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(poll) ? poll : DEFAULT_CONFIG.poll_interval) * 60_000,
    eventHour: Number(EVENT_HOURS.includes(hour) ? hour : DEFAULT_CONFIG.event_hour),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
