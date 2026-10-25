import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function releaseAllowed({ revision, main, runs }) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '') || revision !== main) return false;
  const latest = [...runs]
    .filter(
      (run) =>
        run.headSha === revision &&
        run.headBranch === 'main' &&
        ['push', 'schedule', 'workflow_dispatch'].includes(run.event),
    )
    .sort((a, b) => b.databaseId - a.databaseId)[0];
  return latest?.status === 'completed' && latest.conclusion === 'success';
}

function main() {
  const sh = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
  const revision = process.env.REVISION;
  const main = sh('git', ['rev-parse', 'origin/main']);
  if (!/^[a-f0-9]{40}$/.test(revision ?? ''))
    throw new Error('A full lowercase commit SHA is required.');
  const runs = JSON.parse(
    sh('gh', [
      'run',
      'list',
      '--repo',
      process.env.GITHUB_REPOSITORY || 'Grabman1987/budget',
      '--workflow=ci.yml',
      '--branch=main',
      '--commit',
      revision,
      '--limit=30',
      '--json',
      'databaseId,headSha,headBranch,event,status,conclusion',
    ]),
  );
  if (!releaseAllowed({ revision, main, runs }))
    throw new Error('Release requires current main and its latest completed successful CI.');
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `revision=${revision}\n`);
  console.log(`Verified release candidate ${revision}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
