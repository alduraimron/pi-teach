import { afterEach, describe, expect, it } from 'vitest';
import { rmSync, readdirSync } from 'node:fs';
import { GitProjectInspector } from '../src/project/git.ts';
import { SqliteTeachStore } from '../src/storage/store.ts';
import { TeachRuntime, classify } from '../src/lesson/runtime.ts';
import { general, project, repo, temp } from './fixtures.ts';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('general remains general in a repo, project request carries immutable context', () => {
  const r = repo(); dirs.push(r.root); const data = temp(); dirs.push(data);
  const store = new SqliteTeachStore(data); const runtime = new TeachRuntime(store, new GitProjectInspector());
  expect(classify('explain virtual memory')).toBe('general');
  expect(classify('explain our authentication flow')).toBe('project');
  expect(classify('explain why we use mutexes here')).toBe('project');
  const gen = runtime.begin('explain virtual memory', r.root); expect(gen.kind).toBe('general'); expect(gen.project).toBeUndefined();
  const saved = runtime.submit(gen, general()); expect(saved.meta.kind).toBe('general');
  const p = runtime.begin('explain how authentication works in this project', r.root); expect(p.project?.revision).toBe(r.revision);
  const savedP = runtime.submit(p, project(p.project!)); expect(savedP.meta.projectName).toBe(p.project?.name);
  expect(savedP.document.evidence[0].path).toBe('src/auth.ts');
  expect(store.list()).toHaveLength(2); store.close();
  const reopened = new SqliteTeachStore(data); expect(reopened.list()).toHaveLength(2); reopened.close();
});
it('rejects traversal and wrong kind without any successful lesson', () => {
  const r = repo(); dirs.push(r.root); const data = temp(); dirs.push(data);
  const store = new SqliteTeachStore(data); const runtime = new TeachRuntime(store, new GitProjectInspector());
  const p = runtime.begin('authentication in this project', r.root);
  expect(() => runtime.submit(p, general())).toThrow(/Expected project/);
  const draft = project(p.project!); draft.evidence[0].path = '../../etc/passwd';
  expect(() => runtime.submit(p, draft)).toThrow(); expect(store.list()).toHaveLength(0);
  expect(readdirSync(`${data}/lessons`)).toHaveLength(0); store.close();
});
it('creates a general lesson outside Git and finds it from another working directory', () => {
  const outside = temp(); dirs.push(outside); const elsewhere = temp(); dirs.push(elsewhere);
  const data = temp(); dirs.push(data); const s = new SqliteTeachStore(data);
  const runtime = new TeachRuntime(s, new GitProjectInspector());
  const generation = runtime.begin('explain dependency injection', outside);
  expect(generation.kind).toBe('general');
  const saved = runtime.submit(generation, general()); s.close();
  const reopened = new SqliteTeachStore(data);
  expect(runtime.begin('explain dependency injection', elsewhere).kind).toBe('general');
  expect(reopened.list('authentication')[0].id).toBe(saved.meta.id); reopened.close();
});
it('explicitly rejects project requests outside Git', () => {
  const outside = temp(); dirs.push(outside); const s = new SqliteTeachStore(temp()); dirs.push(s.directory);
  expect(() => new TeachRuntime(s, new GitProjectInspector()).begin('how authentication works in this project', outside)).toThrow(/Git repository/); s.close();
});
