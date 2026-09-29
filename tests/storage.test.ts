import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { SqliteTeachStore, dataDirectory } from '../src/storage/store.ts';
import { general, temp } from './fixtures.ts';
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function store() { const dir = temp(); directories.push(dir); return new SqliteTeachStore(dir); }
describe('SQLite and revision documents', () => {
  it('uses an explicit absolute test data directory', () => {
    expect(dataDirectory({TEACH_DATA_DIR:'/tmp/isolated-teach'})).toBe('/tmp/isolated-teach');
    expect(() => dataDirectory({TEACH_DATA_DIR:'relative/path'})).toThrow(/absolute/);
  });
  it('creates, lists, searches, persists across instances and working directories', () => {
    const s = store(); const saved = s.create(general());
    expect(s.list()).toHaveLength(1); expect(s.list('SECURITY')).toHaveLength(1); expect(s.list('no-such')).toHaveLength(0);
    expect(s.get(saved.meta.id)?.document.title).toBe('Authentication');
    expect(existsSync(join(s.directory, 'lessons', saved.meta.id, '1.json'))).toBe(true);
    const dir = s.directory; s.close(); const elsewhere = new SqliteTeachStore(dir);
    expect(elsewhere.list('authentication')[0].id).toBe(saved.meta.id); elsewhere.close();
  });
  it('appends new revisions without overwriting history', () => {
    const s = store(); const one = s.create(general()); const changed = general(); changed.title = 'Tokens explained';
    const two = s.append(one.meta.id, changed);
    expect(two.meta.revisionNumber).toBe(2); expect(s.get(one.meta.id)?.document.title).toBe('Tokens explained');
    expect(readdirSync(join(s.directory, 'lessons', one.meta.id)).sort()).toEqual(['1.json','2.json']); s.close();
  });
  it('rejects incompatible database versions without destroying data', () => {
    const dir = temp(); directories.push(dir);
    const db = new DatabaseSync(join(dir, 'teach.db')); db.exec('PRAGMA user_version=2'); db.close();
    expect(() => new SqliteTeachStore(dir)).toThrow(/newer than supported/);
    const check = new DatabaseSync(join(dir, 'teach.db'));
    expect((check.prepare('PRAGMA user_version').get() as {user_version:number}).user_version).toBe(2); check.close();
  });
  it('rolls back metadata when a revision filename already exists', () => {
    const s = store(); const saved = s.create(general());
    const file = join(s.directory, 'lessons', saved.meta.id, '2.json'); writeFileSync(file, 'orphan');
    expect(() => s.append(saved.meta.id, general())).toThrow(/already exists/);
    expect(s.get(saved.meta.id)?.meta.revisionNumber).toBe(1);
    expect(readdirSync(join(s.directory, 'lessons', saved.meta.id))).toEqual(['1.json','2.json']); s.close();
  });
  it('removes a newly renamed document when metadata insertion fails', () => {
    const s = store(); const saved = s.create(general());
    const db = new DatabaseSync(join(s.directory, 'teach.db'));
    db.exec("CREATE TRIGGER reject_revision BEFORE INSERT ON lesson_revisions BEGIN SELECT RAISE(FAIL, 'simulated metadata failure'); END"); db.close();
    const changed = general(); changed.title = 'Changed title';
    expect(() => s.append(saved.meta.id, changed)).toThrow(/simulated/);
    expect(s.get(saved.meta.id)?.document.title).toBe('Authentication');
    expect(existsSync(join(s.directory, 'lessons', saved.meta.id, '2.json'))).toBe(false);
    s.close();
  });
  it('rejects malformed submissions without creating visible rows or revision files', () => {
    const s = store(); const doc = general(); doc.sections[0].slides[0].type = 'fake' as 'title';
    expect(() => s.create(doc)).toThrow(); expect(s.list()).toHaveLength(0);
    const saved = s.create(general()); const bad = general(); bad.sections[0].slides[1].sourceRefs = ['bad'];
    expect(() => s.append(saved.meta.id, bad)).toThrow();
    expect(s.get(saved.meta.id)?.meta.revisionNumber).toBe(1);
    expect(readdirSync(join(s.directory, 'lessons', saved.meta.id))).toEqual(['1.json']); s.close();
  });
});
