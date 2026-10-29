import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prContext, upsertComment } from '../src/github.js';
import { MARKER } from '../src/markdown.js';

const pr = { owner: 'me', repo: 'app', number: 7, apiUrl: 'https://api.github.com' };

function eventFile(body: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), 'tt-')), 'event.json');
  writeFileSync(path, JSON.stringify(body));
  return path;
}

describe('prContext', () => {
  it('reads the PR number from the Actions event', () => {
    const env = { GITHUB_REPOSITORY: 'me/app', GITHUB_EVENT_PATH: eventFile({ pull_request: { number: 7 } }) };
    expect(prContext(env)).toEqual(pr);
  });

  it('returns undefined outside a pull request', () => {
    expect(prContext({ GITHUB_REPOSITORY: 'me/app', GITHUB_EVENT_PATH: eventFile({ ref: 'main' }) })).toBeUndefined();
    expect(prContext({})).toBeUndefined();
  });
});

describe('upsertComment', () => {
  afterEach(() => vi.unstubAllGlobals());

  function mockFetch(existing: Array<{ id: number; body: string }>) {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? 'GET' });
        return new Response(JSON.stringify(init.method ? {} : existing), { status: 200 });
      }),
    );
    return calls;
  }

  it('updates our earlier comment', async () => {
    const calls = mockFetch([
      { id: 1, body: 'LGTM' },
      { id: 2, body: `${MARKER}\nold` },
    ]);
    expect(await upsertComment('t', pr, 'new')).toBe('updated');
    expect(calls.at(-1)).toEqual({ url: 'https://api.github.com/repos/me/app/issues/comments/2', method: 'PATCH' });
  });

  it('creates a comment when there is none', async () => {
    const calls = mockFetch([{ id: 1, body: 'LGTM' }]);
    expect(await upsertComment('t', pr, 'new')).toBe('created');
    expect(calls.at(-1)).toEqual({ url: 'https://api.github.com/repos/me/app/issues/7/comments', method: 'POST' });
  });

  it('does not leak the token in errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })));
    await expect(upsertComment('secret-token', pr, 'x')).rejects.toThrow(/failed: 403$/);
    await expect(upsertComment('secret-token', pr, 'x')).rejects.not.toThrow(/secret-token/);
  });
});
