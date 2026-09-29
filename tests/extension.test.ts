import { afterEach, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { createTeachExtension } from '../extensions/teach/index.ts';
import { SqliteTeachStore } from '../src/storage/store.ts';
import { general, project, repo, temp } from './fixtures.ts';
const dirs: string[] = [];
afterEach(() => { delete process.env.TEACH_DATA_DIR; for (const d of dirs.splice(0)) rmSync(d, {recursive:true,force:true}); });
function fakePi(cwd: string) {
  const commands = new Map<string, any>(); const tools = new Map<string, any>(); const events = new Map<string, any>();
  const messages: string[] = []; const notifications: string[] = []; let active = ['read','grep','edit','teach_submit_lesson'];
  const pi = {
    registerCommand: (name: string, options: any) => commands.set(name, options),
    registerTool: (options: any) => tools.set(options.name, options),
    on: (name: string, callback: any) => events.set(name, callback),
    getActiveTools: () => [...active], setActiveTools: (tools: string[]) => { active = tools; },
    sendUserMessage: (text: string) => { messages.push(text); },
  };
  const ctx = { cwd, hasUI: true, ui: {notify: (text: string) => notifications.push(text)}, sessionManager: {getSessionId: () => 'test-session'} };
  return { pi, ctx, commands, tools, events, messages, notifications, active: () => active };
}
it('dispatches /teach open through a doubleable browser without invoking the agent', async () => {
  const dir = temp(); dirs.push(dir); process.env.TEACH_DATA_DIR = dir;
  const fake = fakePi(dir); let opens = 0;
  createTeachExtension({ lifecycle: { open: async () => { opens++; return 'http://127.0.0.1:1111/'; }, ensure: async () => 'http://127.0.0.1:1111/' } })(fake.pi as any);
  await fake.commands.get('teach').handler('open', fake.ctx);
  expect(opens).toBe(1); expect(fake.messages).toEqual([]);
  fake.events.get('session_shutdown')();
});
it('uses current Pi agent for general request, rejects malformed tool data, then saves one valid lesson', async () => {
  const dir = temp(); dirs.push(dir); process.env.TEACH_DATA_DIR = dir;
  const fake = fakePi(dir);
  createTeachExtension({ lifecycle: { open: async () => '', ensure: async () => 'http://127.0.0.1:1234/' } })(fake.pi as any);
  await fake.commands.get('teach').handler('explain dependency injection', fake.ctx);
  expect(fake.messages[0]).toContain('Teach request: explain dependency injection');
  expect(fake.messages[0]).toContain('Kind: general'); expect(fake.active()).not.toContain('edit');
  expect(fake.events.get('tool_call')({toolName:'write'})).toMatchObject({block:true});
  expect(fake.events.get('tool_call')({toolName:'read'})).toBeUndefined();
  const requestId = fake.messages[0].match(/Generation ID: ([\w-]+)/)![1];
  await expect(fake.tools.get('teach_submit_lesson').execute('', {requestId:'wrong', draftJson:JSON.stringify(general())}, undefined, undefined, fake.ctx)).rejects.toThrow(/matching active/);
  await expect(fake.tools.get('teach_submit_lesson').execute('', {requestId, draftJson: '{invalid'}, undefined, undefined, fake.ctx)).rejects.toThrow();
  await expect(fake.tools.get('teach_submit_lesson').execute('', {requestId, draftJson: JSON.stringify({schemaVersion:1})}, undefined, undefined, fake.ctx)).rejects.toThrow();
  const store = new SqliteTeachStore(dir); expect(store.list()).toHaveLength(0); store.close();
  await fake.tools.get('teach_submit_lesson').execute('', {requestId, draftJson:JSON.stringify(general())}, undefined, undefined, fake.ctx);
  expect(fake.active()).toContain('edit'); const s = new SqliteTeachStore(dir); expect(s.list()).toHaveLength(1); s.close(); fake.events.get('session_shutdown')();
});
it('passes project snapshot to active agent, validates and stores source-backed lesson', async () => {
  const r = repo(); dirs.push(r.root); const dir = temp(); dirs.push(dir); process.env.TEACH_DATA_DIR = dir;
  const fake = fakePi(r.root);
  createTeachExtension({ lifecycle: { open: async () => '', ensure: async () => 'http://127.0.0.1:1234/' } })(fake.pi as any);
  await fake.commands.get('teach').handler('explain authentication in this project', fake.ctx);
  expect(fake.messages[0]).toContain('Kind: project'); expect(fake.messages[0]).toContain(r.revision);
  const id = fake.messages[0].match(/Generation ID: ([\w-]+)/)![1];
  const snapshot = JSON.parse(fake.messages[0].match(/Captured project metadata for the lesson: (\{[^\n]+\})/)![1]);
  expect(snapshot.root).toBeUndefined();
  const bad = project(snapshot); bad.evidence[0].path = '../../etc/passwd';
  await expect(fake.tools.get('teach_submit_lesson').execute('', {requestId:id, draftJson:JSON.stringify(bad)}, undefined, undefined, fake.ctx)).rejects.toThrow();
  await fake.tools.get('teach_submit_lesson').execute('', {requestId:id, draftJson:JSON.stringify(project(snapshot))}, undefined, undefined, fake.ctx);
  const s = new SqliteTeachStore(dir); expect(s.list()[0].kind).toBe('project'); s.close(); fake.events.get('session_shutdown')();
});
