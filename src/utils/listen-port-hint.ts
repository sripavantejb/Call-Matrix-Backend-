import { execFile } from 'node:child_process';

function execFileUtf8(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, [...args], { encoding: 'utf8' }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(String(stdout ?? ''));
    });
  });
}

function parseWindowsNetstatListeningPid(line: string, port: number): string | null {
  if (!/\bLISTENING\b/i.test(line)) {
    return null;
  }
  const parts = line.trim().split(/\s+/);
  if (parts.length < 5) {
    return null;
  }
  const local = parts[1];
  const pid = parts[parts.length - 1];
  if (!/^\d+$/.test(pid)) {
    return null;
  }
  const portMatch = local.match(/:(\d+)$/);
  if (!portMatch || Number(portMatch[1]) !== port) {
    return null;
  }
  return pid;
}

/**
 * Best-effort: returns PIDs that appear to be listening on `port` (for log hints only).
 */
export async function getListeningPids(port: number): Promise<string[]> {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return [];
  }

  if (process.platform === 'win32') {
    try {
      const stdout = await execFileUtf8('netstat', ['-ano']);
      const pids = new Set<string>();
      for (const line of stdout.split(/\r?\n/)) {
        const pid = parseWindowsNetstatListeningPid(line, port);
        if (pid) {
          pids.add(pid);
        }
      }
      return [...pids];
    } catch {
      return [];
    }
  }

  try {
    const stdout = await execFileUtf8('lsof', [
      '-iTCP:' + String(port),
      '-sTCP:LISTEN',
      '-t',
      '-n',
      '-P',
    ]);
    const pids = stdout
      .split(/\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);
    return [...new Set(pids)];
  } catch {
    // Linux fallback when lsof is not installed
    if (process.platform === 'linux') {
      try {
        const stdout = await execFileUtf8('fuser', [`${port}/tcp`]);
        const pids = stdout
          .replace(/^\d+\/tcp:\s*/i, '')
          .trim()
          .split(/\s+/)
          .filter((token: string) => /^\d+$/.test(token));
        return [...new Set(pids)];
      } catch {
        return [];
      }
    }
    return [];
  }
}

export function formatKillHint(pids: string[]): string | undefined {
  if (pids.length === 0) {
    return undefined;
  }
  if (process.platform === 'win32') {
    return pids.map((p) => `taskkill /PID ${p} /F`).join(' | ');
  }
  return pids.map((p) => `kill ${p}`).join(' | ');
}
