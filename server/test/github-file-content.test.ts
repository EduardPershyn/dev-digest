import { describe, it, expect, vi } from 'vitest';
import {
  OctokitGitHubClient,
  mapFileContent,
  MAX_FILE_CONTENT_BYTES,
} from '../src/adapters/github/octokit.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';

const repo = { owner: 'acme', name: 'payments-api' };
const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64');

/** Swap the private Octokit for a stub exposing only repos.getContent. */
function clientWith(getContent: (...args: unknown[]) => Promise<unknown>) {
  const client = new OctokitGitHubClient('test-token');
  (client as unknown as { octokit: unknown }).octokit = { rest: { repos: { getContent } } };
  return client;
}

describe('OctokitGitHubClient.getFileContent', () => {
  it('ok: base64-decodes a text file and passes path + ref through', async () => {
    const getContent = vi.fn(async () => ({
      data: { type: 'file', size: 11, sha: 'abc', encoding: 'base64', content: b64('# Spec\nhello') },
    }));
    const res = await clientWith(getContent).getFileContent(repo, 'docs/spec.md', 'deadbeef');
    expect(res).toEqual({ status: 'ok', text: '# Spec\nhello', sha: 'abc', size: 12 });
    expect(getContent).toHaveBeenCalledWith({
      owner: 'acme',
      repo: 'payments-api',
      path: 'docs/spec.md',
      ref: 'deadbeef',
    });
  });

  it('404 → not_found (not thrown, not retried)', async () => {
    const getContent = vi.fn(async () => {
      throw Object.assign(new Error('Not Found'), { status: 404 });
    });
    expect(await clientWith(getContent).getFileContent(repo, 'x.md', 'main')).toEqual({
      status: 'not_found',
    });
    expect(getContent).toHaveBeenCalledTimes(1);
  });

  it('403 → forbidden', async () => {
    const getContent = vi.fn(async () => {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    });
    expect(await clientWith(getContent).getFileContent(repo, 'x.md', 'main')).toEqual({
      status: 'forbidden',
    });
  });

  it('other errors propagate', async () => {
    const getContent = vi.fn(async () => {
      throw Object.assign(new Error('Unprocessable'), { status: 422 });
    });
    await expect(clientWith(getContent).getFileContent(repo, 'x.md', 'main')).rejects.toThrow(
      'Unprocessable',
    );
  });
});

describe('mapFileContent', () => {
  it('directory (array) → not_found', () => {
    expect(mapFileContent([{ type: 'file' }])).toEqual({ status: 'not_found' });
  });

  it('symlink / submodule → not_found', () => {
    expect(mapFileContent({ type: 'symlink', size: 3 })).toEqual({ status: 'not_found' });
    expect(mapFileContent({ type: 'submodule', size: 0 })).toEqual({ status: 'not_found' });
  });

  it('over the 200 KB cap → too_large (by declared size and by decoded bytes)', () => {
    expect(mapFileContent({ type: 'file', size: MAX_FILE_CONTENT_BYTES + 1 })).toEqual({
      status: 'too_large',
    });
    const big = Buffer.alloc(MAX_FILE_CONTENT_BYTES + 1, 'a');
    expect(mapFileContent({ type: 'file', size: 10, encoding: 'base64', content: b64(big) })).toEqual({
      status: 'too_large',
    });
    // > 1 MB files come back with encoding "none"
    expect(mapFileContent({ type: 'file', size: 100, encoding: 'none', content: '' })).toEqual({
      status: 'too_large',
    });
  });

  it('a NUL byte → binary', () => {
    const bin = Buffer.from([0x89, 0x50, 0x00, 0x47]);
    expect(mapFileContent({ type: 'file', size: 4, encoding: 'base64', content: b64(bin) })).toEqual({
      status: 'binary',
    });
  });
});

describe('MockGitHubClient (M3 extensions)', () => {
  it('serves files by ref:path or path and records reads', async () => {
    const gh = new MockGitHubClient({
      files: { 'abc:docs/a.md': 'A at abc', 'docs/b.md': 'B any ref', 'docs/c.md': 'forbidden' },
    });
    expect(await gh.getFileContent(repo, 'docs/a.md', 'abc')).toMatchObject({ status: 'ok', text: 'A at abc' });
    expect(await gh.getFileContent(repo, 'docs/a.md', 'main')).toEqual({ status: 'not_found' });
    expect(await gh.getFileContent(repo, 'docs/b.md', 'main')).toMatchObject({ text: 'B any ref' });
    expect(await gh.getFileContent(repo, 'docs/c.md', 'main')).toEqual({ status: 'forbidden' });
    expect(gh.fileReads).toHaveLength(4);
  });

  it('issues map: not_found / forbidden throw with an HTTP status', async () => {
    const gh = new MockGitHubClient({ issues: { 1: 'not_found', 2: 'forbidden' } });
    await expect(gh.getIssue(repo, 1)).rejects.toMatchObject({ status: 404 });
    await expect(gh.getIssue(repo, 2)).rejects.toMatchObject({ status: 403 });
    expect((await gh.getIssue(repo, 3)).title).toBe('Issue #3');
  });
});
