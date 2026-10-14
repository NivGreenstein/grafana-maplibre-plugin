import type { Fetcher } from '../geo/types';
import type { HeaderRow } from '../types';

// Adapted from https://github.com/NivGreenstein/ogc-tiles-viewer (src/requestHeaders.ts).

// A header with a host only goes to that host and its subdomains; without one it goes everywhere.
const hostMatches = (requestHost: string, host: string) => {
  const wanted = host
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  return !wanted || requestHost === wanted || requestHost.endsWith(`.${wanted}`);
};

export function headersFor(url: string, rows: HeaderRow[]): Array<[string, string]> {
  let target: URL;
  try {
    target = new URL(url, globalThis.location?.href);
  } catch {
    return [];
  }
  if (!/^https?:$/.test(target.protocol)) {
    return [];
  }
  return rows
    .filter((row) => row.enabled && row.name.trim() && hostMatches(target.host.toLowerCase(), row.host))
    .map((row) => [row.name.trim(), row.value]);
}

// Header names and values with dashboard variables resolved.
export const interpolateHeaders = (rows: HeaderRow[], replace: (value: string) => string): HeaderRow[] =>
  (rows ?? []).map((row) => ({ ...row, name: replace(row.name), value: replace(row.value), host: replace(row.host) }));

const nativeFetch: typeof fetch = (...args) => globalThis.fetch(...args);

export function makeFetcher(rows: HeaderRow[], base: typeof fetch = nativeFetch): Fetcher {
  return (url, init) => {
    const extra = headersFor(url, rows);
    if (!extra.length) {
      return base(url, init);
    }
    const headers = new Headers(init?.headers);
    // A header the request sets itself wins.
    for (const [name, value] of extra) {
      if (!headers.has(name)) {
        headers.set(name, value);
      }
    }
    return base(url, { ...init, headers });
  };
}

// The reprojection plugin calls the page's fetch with no hook, so its source tiles get headers here.
// Only URLs under a registered prefix are touched; Grafana's own requests never are.
const prefixes = new Map<string, { prefix: string; rows: HeaderRow[] }>();
let installed = false;

export function registerFetchPrefix(key: string, prefix: string, rows: HeaderRow[]) {
  prefixes.set(key, { prefix, rows });
  if (installed) {
    return;
  }
  installed = true;
  const original = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    for (const entry of prefixes.values()) {
      if (entry.prefix && url.startsWith(entry.prefix)) {
        return makeFetcher(entry.rows, original)(url, init);
      }
    }
    return original(input, init);
  };
}

export function unregisterFetchPrefixes(keyPrefix: string) {
  for (const key of prefixes.keys()) {
    if (key.startsWith(keyPrefix)) {
      prefixes.delete(key);
    }
  }
}

// The fixed part of a tile template, before its first placeholder.
export const templatePrefix = (template: string) => template.split('{')[0];
