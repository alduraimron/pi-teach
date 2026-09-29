import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import type { TeachStore } from '../storage/store.ts';

export function makeServer(store: TeachStore, assetRoot: string, token: string) {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const host = req.headers.host ?? '';
    const port = (req.socket.address() as { port: number }).port;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) { res.writeHead(403).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'");
    let isApi = false;
    try {
      const url = new URL(req.url ?? '/', `http://${host}`);
      isApi = url.pathname.startsWith('/api/');
      if (url.pathname === '/api/health') {
        if (req.headers['x-teach-token'] !== token) { res.writeHead(403).end(); return; }
        json(res, { ok: true }); return;
      }
      if (url.pathname === '/api/lessons') { json(res, store.list(url.searchParams.get('q') ?? '')); return; }
      if (url.pathname.startsWith('/api/lessons/')) {
        const id = url.pathname.slice('/api/lessons/'.length);
        const lesson = store.get(id);
        if (!lesson) { res.writeHead(404).end(); return; }
        json(res, lesson); return;
      }
      let file = 'index.html';
      if (url.pathname.startsWith('/assets/') && /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) file = url.pathname.slice(1);
      else if (url.pathname !== '/' && !/^\/lesson\/[0-9a-f-]{36}$/.test(url.pathname)) { res.writeHead(404).end(); return; }
      const path = resolve(assetRoot, file);
      if (!path.startsWith(resolve(assetRoot) + sep) || !statSync(path).isFile()) { res.writeHead(404).end(); return; }
      const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
      res.setHeader('Content-Type', `${mime[extname(path)] ?? 'application/octet-stream'}; charset=utf-8`);
      res.end(req.method === 'HEAD' ? undefined : readFileSync(path));
    } catch { res.writeHead(isApi ? 500 : 404).end(); }
  });
}
function json(res: ServerResponse, value: unknown) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); }
