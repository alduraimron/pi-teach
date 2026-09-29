import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { readFileSync } from 'node:fs';
import { GitProjectInspector } from '../../src/project/git.ts';
import { SqliteTeachStore } from '../../src/storage/store.ts';
import { TeachRuntime, type Generation } from '../../src/lesson/runtime.ts';
import { ServerLifecycle } from '../../src/server/lifecycle.ts';

const readTools = new Set(['read', 'grep', 'find', 'ls', 'ffgrep', 'fffind', 'web_search', 'ninerouter_web_search', 'ninerouter_web_fetch', 'fetch_content', 'get_search_content', 'source_check', 'teach_submit_lesson']);
export function createTeachExtension(ports?: { lifecycle?: Pick<ServerLifecycle, 'open' | 'ensure'>; inspector?: GitProjectInspector }) {
  return function teachExtension(pi: ExtensionAPI) {
  let store: SqliteTeachStore | undefined;
  let pending: { generation: Generation; sessionId: string; previousTools: string[] } | undefined;
  const runtime = () => new TeachRuntime(store ??= new SqliteTeachStore(), ports?.inspector ?? new GitProjectInspector());
  const lifecycle = ports?.lifecycle ?? new ServerLifecycle();
  const notify = (ctx: { hasUI: boolean; ui: { notify: (message: string, level: 'info' | 'error') => void } }, message: string, level: 'info' | 'error' = 'info') => {
    if (ctx.hasUI) ctx.ui.notify(message, level);
  };
  const clear = () => { if (pending) pi.setActiveTools(pending.previousTools); pending = undefined; };

  pi.registerCommand('teach', {
    description: 'Create a structured lesson or open the global Teach library',
    handler: async (args, ctx) => {
      const request = args.trim();
      if (!request) { notify(ctx, 'Usage: /teach <learning request> or /teach open', 'error'); return; }
      if (request === 'open') {
        try { notify(ctx, `Teach library: ${await lifecycle.open()}`); }
        catch (error) { notify(ctx, `Teach could not open: ${String(error)}`, 'error'); }
        return;
      }
      if (pending) { notify(ctx, 'A Teach lesson is already being generated', 'error'); return; }
      try {
        const generation = runtime().begin(request, ctx.cwd);
        const previousTools = pi.getActiveTools();
        if (!previousTools.includes('teach_submit_lesson')) throw new Error('Teach submission tool is disabled in this Pi session');
        pending = { generation, sessionId: ctx.sessionManager.getSessionId(), previousTools };
        pi.setActiveTools(previousTools.filter(name => readTools.has(name)));
        notify(ctx, generation.project ? `Teaching in ${generation.project.name} at ${generation.project.revision.slice(0, 8)}${generation.project.dirty ? ' (dirty)' : ''}. Investigating...` : 'Teaching: investigating prerequisites...');
        const skill = readFileSync(new URL('../../skills/teach/SKILL.md', import.meta.url), 'utf8');
        const { root, ...publicProject } = generation.project ?? { root: undefined };
        pi.sendUserMessage(`${skill}\n\nTeach request: ${request}\nGeneration ID: ${generation.id}\nKind: ${generation.kind}\n${generation.project ? `Repository root for read-only investigation: ${root}\nCaptured project metadata for the lesson: ${JSON.stringify(publicProject)}\nInvestigate using read-only tools before writing the lesson. Copy repository code exactly and cite its file and line range.` : 'Do not make this a project lesson.'}\nSubmit exactly one complete schemaVersion 1 lesson with teach_submit_lesson({requestId, draftJson}) where draftJson is a JSON string encoding the lesson object. Do not write lesson files yourself. The draft must include sections, slides, sources and evidence (empty arrays for general). Code slides need origin: example or repository. Project slides require exact repository code and valid evidence references. No HTML or generated UI.`);
      } catch (error) { clear(); notify(ctx, `Teach could not start: ${String(error)}`, 'error'); }
    },
  });
  pi.registerTool({
    name: 'teach_submit_lesson', label: 'Save Teach lesson', description: 'Validate and persist the completed structured Teach lesson for the active /teach request. No filesystem path is accepted.',
    parameters: Type.Object({ requestId: Type.String(), draftJson: Type.String({ description: 'Complete JSON-serialized structured lesson document' }) }),
    async execute(_id, params, _signal, _update, ctx) {
      if (!pending || ctx.sessionManager.getSessionId() !== pending.sessionId || params.requestId !== pending.generation.id) throw new Error('No matching active Teach request');
      if (params.draftJson.length > 300_000) throw new Error('Lesson draft is too large');
      const draft: unknown = JSON.parse(params.draftJson);
      const saved = runtime().submit(pending.generation, draft);
      clear();
      let url = '';
      try { url = `${await lifecycle.ensure()}lesson/${saved.meta.id}`; } catch { /* saved lesson remains available through /teach open */ }
      notify(ctx, `Saved: ${saved.meta.title}${url ? ` | ${url}` : ' | Run /teach open to view it'}`);
      return { content: [{ type: 'text', text: `Saved: ${saved.meta.title}${url ? `\nOpen: ${url}` : '\nRun /teach open to view it'}` }], details: { id: saved.meta.id } };
    },
  });
  pi.on('tool_call', (event) => {
    if (pending && !readTools.has(event.toolName)) return { block: true, reason: 'Teach investigation is read-only. Use read/search tools and teach_submit_lesson.' };
  });
  pi.on('agent_settled', (_event, ctx) => { if (pending) { clear(); notify(ctx, 'Teach did not receive a valid completed lesson. Nothing was saved.', 'error'); } });
  pi.on('session_shutdown', () => { clear(); store?.close(); store = undefined; });
  };
}
export default createTeachExtension();
