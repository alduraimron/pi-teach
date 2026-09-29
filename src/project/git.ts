import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, statSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import type { Lesson, ProjectData } from '../domain/lesson.ts';
import { safeRelativePath } from '../domain/lesson.ts';

export interface ProjectSnapshot extends ProjectData { root: string }
export interface ProjectInspector {
  resolve(cwd: string): ProjectSnapshot | undefined;
  validate(lesson: Lesson, snapshot: ProjectSnapshot): void;
}
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } }).trim();
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function isDirty(root: string): boolean { return git(root, 'status', '--porcelain', '--untracked-files=normal').length > 0; }

/** Drop userinfo, query, fragment and ambiguous remote syntax; never store raw remote strings. */
export function normalizeRemote(raw: string): string | undefined {
  const scp = raw.includes('://') ? null : raw.match(/^(?:[^@/\s]+@)?([a-z0-9.-]+):([a-zA-Z0-9_./-]+)$/i);
  const candidate = scp ? `https://${scp[1]}/${scp[2]}` : raw;
  try {
    const u = new URL(candidate);
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(u.protocol) || !/^[a-z0-9.-]+$/i.test(u.hostname) || !/^\/[a-zA-Z0-9_./-]+$/.test(u.pathname) || u.pathname.split('/').includes('..')) return undefined;
    return `https://${u.hostname.toLowerCase()}${u.port ? `:${u.port}` : ''}${u.pathname.replace(/\/$/, '').replace(/\.git$/i, '')}`;
  } catch { return undefined; }
}
export class GitProjectInspector implements ProjectInspector {
  resolve(cwd: string): ProjectSnapshot | undefined {
    let root: string;
    try { root = realpathSync(git(cwd, 'rev-parse', '--show-toplevel')); } catch { return undefined; }
    let revision: string;
    try { revision = git(root, 'rev-parse', 'HEAD'); } catch { throw new Error('Teach requires a committed HEAD for project lessons'); }
    const raw = (() => { try { return git(root, 'remote', 'get-url', 'origin'); } catch { return ''; } })();
    const canonicalRemote = normalizeRemote(raw);
    // Root commit + initial tree is stable across moves for repositories without a remote.
    const first = git(root, 'rev-list', '--max-parents=0', 'HEAD').split('\n')[0];
    const repositoryKey = `${canonicalRemote ? 'remote' : 'local'}:${hash(canonicalRemote ?? `${first}:${git(root, 'rev-parse', `${first}^{tree}`)}`)}`;
    return { root, repositoryKey, name: basename(root), revision, dirty: isDirty(root), ...(canonicalRemote ? { canonicalRemote } : {}) };
  }
  validate(lesson: Lesson, snapshot: ProjectSnapshot): void {
    if (lesson.kind !== 'project') return;
    if (lesson.project.repositoryKey !== snapshot.repositoryKey || lesson.project.revision !== snapshot.revision || lesson.project.dirty !== snapshot.dirty || lesson.project.name !== snapshot.name || lesson.project.canonicalRemote !== snapshot.canonicalRemote) throw new Error('Project metadata differs from captured snapshot');
    if (git(snapshot.root, 'rev-parse', 'HEAD') !== snapshot.revision) throw new Error('Project HEAD changed during investigation');
    if (isDirty(snapshot.root) !== snapshot.dirty) throw new Error('Project working-tree dirty state changed during investigation');
    const verifiedLines = new Map<string, string[]>();
    for (const item of lesson.evidence) {
      if (!safeRelativePath(item.path)) throw new Error('Unsafe repository evidence path');
      const candidate = resolve(snapshot.root, item.path);
      if (isAbsolute(item.path)) throw new Error('Absolute repository evidence path');
      let file: string;
      try { file = realpathSync(candidate); } catch { throw new Error(`Evidence file no longer exists: ${item.path}`); }
      if (relative(snapshot.root, file).startsWith('..') || isAbsolute(relative(snapshot.root, file)) || !statSync(file).isFile()) throw new Error(`Evidence escapes repository: ${item.path}`);
      if (statSync(file).size > 1024 * 1024) throw new Error('Evidence file is too large');
      const lines = readFileSync(file, 'utf8').split('\n');
      verifiedLines.set(item.id, lines);
      if (item.endLine && item.endLine > lines.length) throw new Error(`Evidence line out of range: ${item.path}`);
    }
    for (const slide of lesson.sections.flatMap(s => s.slides)) {
      if (slide.type !== 'code' || slide.origin !== 'repository') continue;
      if (!slide.evidenceRefs?.some(ref => {
        const item = lesson.evidence.find(e => e.id === ref);
        if (!item) return false;
        const lines = verifiedLines.get(item.id);
        if (!lines) return false;
        const end = item.endLine ?? lines.length;
        const excerpt = lines.slice((item.startLine ?? 1) - 1, end).join('\n');
        return (excerpt + (end < lines.length ? '\n' : '')).includes(slide.code);
      })) throw new Error(`Repository code is not an exact excerpt of its evidence: ${slide.id}`);
    }
  }
}
