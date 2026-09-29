import { spawn } from 'node:child_process';
import { openSync, closeSync, unlinkSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { dataDirectory } from '../storage/store.ts';

export interface ServerInfo { port: number; pid: number; token: string }
export interface LifecyclePorts {
  launch(directory: string): void;
  open(url: string): void;
  healthy(info: ServerInfo): Promise<boolean>;
}
export const defaultPorts: LifecyclePorts = {
  launch(directory) {
    const script = fileURLToPath(new URL('../../dist/server.mjs', import.meta.url));
    const assets = fileURLToPath(new URL('../../web/dist', import.meta.url));
    if (!existsSync(script) || !existsSync(join(assets, 'index.html'))) throw new Error('Teach assets are missing. Run npm run build before installing a local/Git package.');
    const child = spawn(process.execPath, [script], { env: { ...process.env, TEACH_DATA_DIR: directory, TEACH_ASSET_ROOT: assets }, detached: true, stdio: 'ignore' });
    child.unref();
  },
  open(url) {
    const [bin, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    const child = spawn(bin, args, { stdio: 'ignore', detached: true });
    child.on('error', () => { /* URL is still reported to user when no browser is installed */ });
    child.unref();
  },
  async healthy(info) {
    try {
      const response = await fetch(`http://127.0.0.1:${info.port}/api/health`, { headers: { 'x-teach-token': info.token }, signal: AbortSignal.timeout(800) });
      return response.ok && (await response.json() as { ok?: boolean }).ok === true;
    } catch { return false; }
  },
};
export class ServerLifecycle {
  readonly directory: string;
  private readonly ports: LifecyclePorts;
  constructor(directory = dataDirectory(), ports: LifecyclePorts = defaultPorts) { this.directory = directory; this.ports = ports; }
  private readInfo(): ServerInfo | undefined {
    try {
      const data: unknown = JSON.parse(readFileSync(join(this.directory, 'runtime', 'server.json'), 'utf8'));
      if (typeof data !== 'object' || !data) return undefined;
      const info = data as ServerInfo;
      return Number.isInteger(info.port) && info.port > 0 && info.port < 65536 && Number.isInteger(info.pid) && /^[0-9a-f]{64}$/.test(info.token) ? info : undefined;
    } catch { return undefined; }
  }
  async ensure(): Promise<string> {
    const existing = this.readInfo();
    if (existing && await this.ports.healthy(existing)) return `http://127.0.0.1:${existing.port}/`;
    const runtime = resolve(this.directory, 'runtime');
    mkdirSync(runtime, { recursive: true, mode: 0o700 });
    const lock = join(runtime, 'start.lock');
    let owner = false;
    for (let i = 0; i < 60; i++) {
      const info = this.readInfo();
      if (info && await this.ports.healthy(info)) return `http://127.0.0.1:${info.port}/`;
      try {
        const fd = openSync(lock, 'wx', 0o600);
        try { writeFileSync(fd, String(process.pid)); } finally { closeSync(fd); }
        owner = true; break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        try {
          if (Date.now() - statSync(lock).mtimeMs > 12000) {
            const pid = Number(readFileSync(lock, 'utf8'));
            let alive = Number.isInteger(pid) && pid > 0;
            if (alive) try { process.kill(pid, 0); } catch (error) { alive = (error as NodeJS.ErrnoException).code === 'EPERM'; }
            if (!alive) unlinkSync(lock);
          }
        } catch { /* raced */ }
        await delay(250);
      }
    }
    if (!owner) throw new Error('Teach server startup lock timed out');
    try {
      const info = this.readInfo();
      if (info && await this.ports.healthy(info)) return `http://127.0.0.1:${info.port}/`;
      this.ports.launch(this.directory);
      for (let i = 0; i < 60; i++) {
        await delay(100);
        const next = this.readInfo();
        if (next && await this.ports.healthy(next)) return `http://127.0.0.1:${next.port}/`;
      }
      throw new Error('Teach server failed to become healthy; run npm run build and check installed package assets');
    } finally { try { unlinkSync(lock); } catch { /* removed */ } }
  }
  async open(): Promise<string> { const url = await this.ensure(); this.ports.open(url); return url; }
}
