import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { SqliteTeachStore } from '../storage/store.ts';
import { makeServer } from './http.ts';

const directory = process.env.TEACH_DATA_DIR;
const assets = process.env.TEACH_ASSET_ROOT;
if (!directory || !assets) throw new Error('TEACH_DATA_DIR and TEACH_ASSET_ROOT are required');
const store = new SqliteTeachStore(directory);
const token = randomBytes(32).toString('hex');
const server = makeServer(store, assets, token);
const runtime = join(directory, 'runtime');
mkdirSync(runtime, { recursive: true, mode: 0o700 });
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to bind Teach');
  const tmp = join(runtime, `server.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify({ port: address.port, pid: process.pid, token }), { mode: 0o600 });
  renameSync(tmp, join(runtime, 'server.json'));
});
function stop() {
  try {
    const file = join(runtime, 'server.json');
    if (JSON.parse(readFileSync(file, 'utf8')).pid === process.pid) unlinkSync(file);
  } catch { /* already absent or superseded */ }
  server.close(() => { store.close(); process.exit(0); });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
