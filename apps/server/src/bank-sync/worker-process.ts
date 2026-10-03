import { fork, type ChildProcess } from 'node:child_process';

/** Restart a crashed worker; its durable due timestamps/leases perform the recovery. */
export function startBankWorker(path: string): () => void {
  let child: ChildProcess | null = null;
  let restart: NodeJS.Timeout | undefined;
  let stopped = false;
  const start = () => {
    if (stopped) return;
    child = fork(path, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.on('error', () => console.error('Bank worker could not start.'));
    child.once('exit', () => {
      child = null;
      if (!stopped) {
        console.error('Bank worker stopped; restarting in 30 seconds.');
        restart = setTimeout(start, 30_000);
        restart.unref();
      }
    });
  };
  start();
  return () => {
    stopped = true;
    if (restart) clearTimeout(restart);
    child?.kill();
  };
}
