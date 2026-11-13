/**
 * In-memory stand-in for the parts of the GitHub REST API the beta upload uses (git refs, commits,
 * trees, contents). Tests pass `fake.fetch` where the app would pass `fetch`; nothing leaves the
 * process. Every request is recorded so tests can check hosts and count commits.
 */

interface Commit {
  sha: string;
  parent: string | null;
  tree: string;
  message: string;
  /** Date.now() when the branch moved to this commit. */
  at: number;
}

export interface FakeGitHub {
  fetch: typeof fetch;
  /** Full URLs of all requests, in order. */
  requests: string[];
  /** Commits added through the API (not the initial one), oldest first. */
  commits: () => Commit[];
  /** File content on the branch head, or undefined. */
  file: (path: string) => string | undefined;
  /** Every request rejects like a browser without network while true. */
  offline: boolean;
  /** Writes a file directly on the branch, as another device would. */
  pushFromElsewhere: (path: string, content: string) => void;
  /** Called once before the next ref update is applied (to simulate a race). */
  beforeNextRefUpdate?: () => void;
}

export function createFakeGitHub(
  repo = 'hanging-pawn/pomodoro-beta-data',
  branch = 'main',
): FakeGitHub {
  let seq = 0;
  const sha = () => (++seq).toString(16).padStart(40, '0');
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, Commit>();
  const added: Commit[] = [];

  const rootTree = sha();
  trees.set(rootTree, new Map([['README.md', '# beta data\n']]));
  const root: Commit = {
    sha: sha(),
    parent: null,
    tree: rootTree,
    message: 'init',
    at: 0,
  };
  commits.set(root.sha, root);
  let head = root.sha;

  const filesAt = (commitSha: string) =>
    trees.get(commits.get(commitSha)!.tree)!;

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  const prefix = `https://api.github.com/repos/${repo}`;

  const fake: FakeGitHub = {
    requests: [],
    offline: false,
    commits: () => [...added],
    file: (path) => filesAt(head).get(path),
    pushFromElsewhere(path, content) {
      const files = new Map(filesAt(head));
      files.set(path, content);
      const tree = sha();
      trees.set(tree, files);
      const c: Commit = {
        sha: sha(),
        parent: head,
        tree,
        message: 'elsewhere',
        at: Date.now(),
      };
      commits.set(c.sha, c);
      head = c.sha;
    },
    fetch: async (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      fake.requests.push(url);
      if (fake.offline) throw new TypeError('Failed to fetch');
      const method = (init?.method ?? 'GET').toUpperCase();
      const auth = new Headers(init?.headers).get('authorization');
      if (!auth?.startsWith('Bearer '))
        return json(401, { message: 'Bad credentials' });
      if (!url.startsWith(prefix)) return json(404, { message: 'Not Found' });
      const u = new URL(url);
      const path = u.pathname.slice(`/repos/${repo}`.length);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      if (method === 'GET' && path === `/git/ref/heads/${branch}`)
        return json(200, { object: { sha: head, type: 'commit' } });
      if (method === 'GET' && path.startsWith('/git/commits/')) {
        const c = commits.get(path.slice('/git/commits/'.length));
        return c
          ? json(200, { sha: c.sha, tree: { sha: c.tree } })
          : json(404, { message: 'Not Found' });
      }
      if (method === 'GET' && path.startsWith('/contents/')) {
        const filePath = path
          .slice('/contents/'.length)
          .split('/')
          .map(decodeURIComponent)
          .join('/');
        const ref = u.searchParams.get('ref') ?? head;
        const content = commits.has(ref)
          ? filesAt(ref).get(filePath)
          : undefined;
        return content === undefined
          ? json(404, { message: 'Not Found' })
          : json(200, { encoding: 'base64', content: toBase64(content) });
      }
      if (method === 'POST' && path === '/git/trees') {
        const files = new Map(trees.get(body.base_tree));
        for (const entry of body.tree) files.set(entry.path, entry.content);
        const tree = sha();
        trees.set(tree, files);
        return json(201, { sha: tree });
      }
      if (method === 'POST' && path === '/git/commits') {
        const c: Commit = {
          sha: sha(),
          parent: body.parents[0],
          tree: body.tree,
          message: body.message,
          at: 0,
        };
        commits.set(c.sha, c);
        return json(201, { sha: c.sha });
      }
      if (method === 'PATCH' && path === `/git/refs/heads/${branch}`) {
        const race = fake.beforeNextRefUpdate;
        fake.beforeNextRefUpdate = undefined;
        race?.();
        const c = commits.get(body.sha);
        if (!c || (c.parent !== head && !body.force))
          return json(422, { message: 'Update is not a fast forward' });
        head = c.sha;
        c.at = Date.now();
        added.push(c);
        return json(200, { object: { sha: head } });
      }
      return json(404, { message: 'Not Found' });
    },
  };
  return fake;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  // GitHub wraps base64 at 60 characters.
  return btoa(bin).replace(/.{60}/g, '$&\n');
}
