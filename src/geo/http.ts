import type { Fetcher } from './types';

export async function fetchText(fetcher: Fetcher, url: string, init?: RequestInit) {
  const response = await fetcher(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText} ${text.slice(0, 300)}`.trim());
  }
  return text;
}

export async function fetchJson(fetcher: Fetcher, url: string) {
  return JSON.parse(await fetchText(fetcher, url, { headers: { Accept: 'application/json' } })) as Record<
    string,
    unknown
  >;
}

export const absolute = (href: string, base: string) =>
  new URL(href, base).toString().replace(/%7B/gi, '{').replace(/%7D/gi, '}');
