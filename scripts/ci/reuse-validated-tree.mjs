// Decides on `push` to main whether this exact tree already passed its required CI as a pull request,
// so ci.yml can skip the duplicate run (see the `reuse` job). Fails closed: anything missing,
// unreadable or different means reuse=false and the full suite runs.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_CHECKS = ['check', 'check-windows', 'docker', 'restore-test'];
const CI_PATH = '.github/workflows/ci.yml';

// A check-run's details_url is self-reported (an API-created run can point anywhere), so the
// workflow run behind it must itself be successful and belong to this PR's branch and repository.
const passed = (c, p) =>
  c.status === 'completed' &&
  c.conclusion === 'success' &&
  c.appSlug === 'github-actions' &&
  c.runPath === CI_PATH &&
  c.runEvent === 'pull_request' &&
  c.runConclusion === 'success' &&
  c.runHeadSha === p.headSha &&
  c.runHeadBranch === p.headRef &&
  c.runHeadRepo === p.repo;

// The newest check-run per name wins, so a failed re-run after a green one blocks reuse.
function validated(p) {
  const latest = new Map();
  for (const c of p.checks ?? []) {
    if (!latest.has(c.name) || c.id > latest.get(c.name).id) latest.set(c.name, c);
  }
  return REQUIRED_CHECKS.every((n) => {
    const c = latest.get(n);
    return c && passed(c, p);
  });
}

// `parentInHead`: the commit before the merge is an ancestor of the PR head, so the merge ref that
// the PR run tested had the same tree as the head.
export function decide({ commitTree, pulls }) {
  const hit = pulls.find(
    (p) =>
      p.sameRepo &&
      p.baseRef === 'main' &&
      p.parentInHead &&
      commitTree &&
      p.headTree === commitTree &&
      validated(p),
  );
  return hit
    ? { reuse: true, reason: `tree already validated by PR #${hit.number} head ${hit.headSha}` }
    : {
        reuse: false,
        reason: `no pull request with an identical, fully validated tree (${pulls.length} checked)`,
      };
}

const sh = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gh = (path) => sh('gh', ['api', '--paginate', path]);
const ghLines = (path, jq) =>
  gh2(path, jq)
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
const gh2 = (path, jq) => sh('gh', ['api', '--paginate', path, '--jq', jq]);

function collect({ repo, sha }) {
  const commitTree = sh('git', ['rev-parse', `${sha}^{tree}`]);
  const runs = new Map();
  const runOf = (url) => {
    const id = /\/actions\/runs\/(\d+)/.exec(url ?? '')?.[1];
    if (!id) return {};
    if (!runs.has(id)) {
      const r = JSON.parse(gh(`repos/${repo}/actions/runs/${id}`));
      runs.set(id, {
        runPath: r.path,
        runEvent: r.event,
        runHeadSha: r.head_sha,
        runConclusion: r.conclusion,
        runHeadBranch: r.head_branch,
        runHeadRepo: r.head_repository?.full_name,
      });
    }
    return runs.get(id);
  };
  const pulls = ghLines(`repos/${repo}/commits/${sha}/pulls`, '.[]').map((pr) => {
    const p = {
      number: pr.number,
      headSha: pr.head.sha,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      repo,
      sameRepo: pr.head.repo?.full_name === repo,
      checks: [],
    };
    if (!p.sameRepo) return p;
    sh('git', ['fetch', '--no-tags', '--quiet', 'origin', `pull/${pr.number}/head`]);
    if (sh('git', ['rev-parse', 'FETCH_HEAD']) !== p.headSha) return p;
    p.headTree = sh('git', ['rev-parse', `${p.headSha}^{tree}`]);
    try {
      sh('git', ['merge-base', '--is-ancestor', `${sha}^`, p.headSha]);
      p.parentInHead = true;
    } catch {
      p.parentInHead = false;
    }
    if (p.headTree !== commitTree || !p.parentInHead) return p;
    const runsJq =
      '.check_runs[] | {id, name, status, conclusion, appSlug: .app.slug, url: .details_url}';
    p.checks = ghLines(`repos/${repo}/commits/${p.headSha}/check-runs?per_page=100`, runsJq)
      .filter((c) => REQUIRED_CHECKS.includes(c.name))
      .map(({ url, ...c }) => ({ ...c, ...runOf(url) }));
    return p;
  });
  return { commitTree, pulls };
}

function main() {
  const { REPO, SHA, GITHUB_OUTPUT } = process.env;
  let result;
  try {
    result = decide(collect({ repo: REPO, sha: SHA }));
  } catch (error) {
    result = { reuse: false, reason: `could not decide (${String(error.message).split('\n')[0]})` };
  }
  console.log(`reuse=${result.reuse}: ${result.reason}`);
  if (GITHUB_OUTPUT) appendFileSync(GITHUB_OUTPUT, `reuse=${result.reuse}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
