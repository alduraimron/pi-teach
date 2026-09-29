import { afterEach, describe, expect, it } from 'vitest';
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { ServerLifecycle, type LifecyclePorts, type ServerInfo } from '../src/server/lifecycle.ts';
import { makeServer } from '../src/server/http.ts';
import { SqliteTeachStore } from '../src/storage/store.ts';
import { general, temp } from './fixtures.ts';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }); });
describe('local web server and lifecycle', () => {
  it('serves validated fixtures and restricts host, method and identifiers', async () => {
    const dir = temp(); dirs.push(dir); const store = new SqliteTeachStore(dir); const saved = store.create(general());
    const server = makeServer(store, fileURLToPath(new URL('../web/dist/', import.meta.url)), 'a'.repeat(64));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('no address');
      expect(address.address).toBe('127.0.0.1'); const base = `http://127.0.0.1:${address.port}`;
      expect((await (await fetch(`${base}/api/lessons`)).json() as unknown[])).toHaveLength(1);
      expect((await (await fetch(`${base}/api/lessons/${saved.meta.id}`)).json() as {document: {title:string}}).document.title).toBe('Authentication');
      expect((await fetch(`${base}/lesson/${saved.meta.id}`)).status).toBe(200);
      expect((await fetch(`${base}/api/health`)).status).toBe(403);
      expect((await fetch(`${base}/api/health`, { headers: { 'x-teach-token': 'a'.repeat(64) } })).status).toBe(200);
      expect((await fetch(`${base}/api/lessons/../../etc/passwd`)).status).toBe(404);
      expect((await fetch(`${base}/api/lessons`, { method: 'POST' })).status).toBe(405);
      const badHost = await new Promise<number>((resolve, reject) => { const req = request(base, { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode ?? 0); }); req.on('error', reject); req.end(); });
      expect(badHost).toBe(403);
    } finally { server.close(); await once(server, 'close'); store.close(); }
  });
  it('reuses a healthy server and does not reopen a browser by itself', async () => {
    const dir = temp(); dirs.push(dir); mkdirSync(join(dir, 'runtime'));
    const info: ServerInfo = { port: 54321, pid: 99, token: 'a'.repeat(64) };
    writeFileSync(join(dir, 'runtime', 'server.json'), JSON.stringify(info));
    const opened: string[] = []; let starts = 0;
    const ports: LifecyclePorts = { launch: () => { starts++; }, healthy: async () => true, open: url => { opened.push(url); } };
    const lifecycle = new ServerLifecycle(dir, ports);
    await lifecycle.open(); await lifecycle.open(); expect(starts).toBe(0); expect(opened).toEqual(['http://127.0.0.1:54321/', 'http://127.0.0.1:54321/']);
  });
  it('starts a missing server once and shares the selected port', async () => {
    const dir = temp(); dirs.push(dir); let starts = 0; let ready = false;
    const ports: LifecyclePorts = {
      launch: () => { starts++; const runtime = join(dir, 'runtime'); mkdirSync(runtime, {recursive:true}); writeFileSync(join(runtime, 'server.json'), JSON.stringify({ port: 3333, pid: 1, token: 'b'.repeat(64) })); ready = true; },
      healthy: async () => ready, open: () => {},
    };
    const l = new ServerLifecycle(dir, ports); expect(await l.ensure()).toContain(':3333/'); expect(await l.ensure()).toContain(':3333/'); expect(starts).toBe(1);
  });
});
