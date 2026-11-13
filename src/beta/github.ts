/**
 * Client for the private beta data repo on GitHub (FR-501). The only host it ever talks to is
 * `api.github.com` (NFR-09). The token is passed in at runtime and never stored here (NFR-16).
 *
 * One call = at most one commit, however many files change: the client reads the branch head,
 * lets the caller compute the new file contents from what is there, and writes them with the git
 * data API (tree + commit + ref). If the branch moved meanwhile (another device), it reads again
 * and lets the caller merge again.
 */

export const GITHUB_API = 'https://api.github.com';

/** Reads a file at the commit the update is based on; null if it does not exist. */
export type ReadFile = (path: string) => Promise<string | null>;

/**
 * Returns the files to write (path → full new content), or null for nothing to commit.
 * Called again with fresh contents if the branch moved; must therefore be free of side effects.
 */
export type Update = (read: ReadFile) => Promise<Record<string, string> | null>;

export interface RepoClient {
  /**
   * 'committed' after one new commit on the branch, 'unchanged' if the update wrote nothing or
   * every file already had the new content. Rejects on network or API errors (nothing written).
   */
  commit(message: string, update: Update): Promise<'committed' | 'unchanged'>;
}

export interface RepoClientOptions {
  /** `owner/name`. */
  repo: string;
  token: string;
  /** Defaults to `main`. */
  branch?: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Attempts when the branch moves during an update. Defaults to 3. */
  attempts?: number;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function createRepoClient(options: RepoClientOptions): RepoClient {
  const { repo, token, branch = 'main', attempts = 3 } = options;
  if (!REPO.test(repo) || repo.split('/').some((p) => /^\.+$/.test(p)))
    throw new Error(`Invalid repo ${repo}`);
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const base = `${GITHUB_API}/repos/${repo}`;

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await doFetch(base + path, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok)
      throw new GitHubError(res.status, `${method} ${path}: ${res.status}`);
    return (await res.json()) as T;
  }

  const encodePath = (p: string) =>
    p.split('/').map(encodeURIComponent).join('/');

  async function attempt(message: string, update: Update) {
    const ref = await call<{ object: { sha: string } }>(
      'GET',
      `/git/ref/heads/${branch}`,
    );
    const parent = ref.object.sha;
    const cache = new Map<string, Promise<string | null>>();
    const fetchFile = async (path: string) => {
      try {
        const file = await call<{ content: string }>(
          'GET',
          `/contents/${encodePath(path)}?ref=${parent}`,
        );
        return fromBase64(file.content);
      } catch (e) {
        if (e instanceof GitHubError && e.status === 404) return null;
        throw e;
      }
    };
    const read: ReadFile = (path) => {
      if (!cache.has(path)) cache.set(path, fetchFile(path));
      return cache.get(path)!;
    };
    const files = await update(read);
    if (!files) return 'unchanged' as const;
    const changed: [string, string][] = [];
    for (const [path, content] of Object.entries(files))
      if ((await read(path)) !== content) changed.push([path, content]);
    if (!changed.length) return 'unchanged' as const;

    const head = await call<{ tree: { sha: string } }>(
      'GET',
      `/git/commits/${parent}`,
    );
    const tree = await call<{ sha: string }>('POST', '/git/trees', {
      base_tree: head.tree.sha,
      tree: changed.map(([path, content]) => ({
        path,
        mode: '100644',
        type: 'blob',
        content,
      })),
    });
    const commit = await call<{ sha: string }>('POST', '/git/commits', {
      message,
      tree: tree.sha,
      parents: [parent],
    });
    await call('PATCH', `/git/refs/heads/${branch}`, {
      sha: commit.sha,
      force: false,
    });
    return 'committed' as const;
  }

  return {
    async commit(message, update) {
      for (let i = 1; ; i++) {
        try {
          return await attempt(message, update);
        } catch (e) {
          // 422 on the ref update: the branch moved (not a fast forward). Merge again.
          if (!(e instanceof GitHubError && e.status === 422) || i >= attempts)
            throw e;
        }
      }
    },
  };
}

function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
