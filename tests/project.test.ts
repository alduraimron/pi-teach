import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GitProjectInspector, normalizeRemote } from '../src/project/git.ts';
import { parseLesson } from '../src/domain/lesson.ts';
import { project, repo, temp } from './fixtures.ts';
const cleanup: string[] = [];
afterEach(() => { for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const inspector = new GitProjectInspector();
describe('repository snapshot and evidence', () => {
  it('recognizes a Git repository, captures HEAD and dirty state, not arbitrary folders', () => {
    const r = repo(); cleanup.push(r.root); const snapshot = inspector.resolve(r.root)!;
    expect(snapshot.revision).toBe(r.revision); expect(snapshot.dirty).toBe(false);
    writeFileSync(join(r.root, 'new-file'), 'dirty'); expect(inspector.resolve(r.root)?.dirty).toBe(true);
    const other = temp(); cleanup.push(other); expect(inspector.resolve(other)).toBeUndefined();
  });
  it('identifies local repositories after moving the path, and normalizes remote credentials', () => {
    const r = repo(); const first = inspector.resolve(r.root)!;
    const parent = mkdtempSync(join(tmpdir(), 'teach-move-')); cleanup.push(parent);
    const moved = join(parent, 'renamed'); renameSync(r.root, moved);
    expect(inspector.resolve(moved)?.repositoryKey).toBe(first.repositoryKey);
    execFileSync('git', ['-C', moved, 'remote', 'add', 'origin', 'https://user:very-secret@Example.org/Org/Repo.git?access_token=abc']);
    const remote = inspector.resolve(moved)!;
    expect(remote.canonicalRemote).toBe('https://example.org/org/repo');
    expect(JSON.stringify(remote)).not.toContain('very-secret');
    expect(normalizeRemote('git@github.com:Owner/Repo.git')).toBe('https://github.com/owner/repo');
    expect(normalizeRemote('ssh://git:secret@Git.example:2222/Org/Repo.git')).toBe('https://git.example:2222/org/repo');
    expect(normalizeRemote('file:///tmp/repo')).toBeUndefined();
  });
  it('validates source file, excerpts, traversal, symlinks, line ranges and revision', () => {
    const r = repo(); cleanup.push(r.root); const snap = inspector.resolve(r.root)!;
    const valid = project(snap); inspector.validate(parseLesson(valid), snap);
    const newline = project(snap); const sourceSlide = newline.sections[0].slides[0];
    if (sourceSlide.type === 'code') sourceSlide.code = '  return token === "secret";\n';
    inspector.validate(parseLesson(newline), snap);
    for (const path of ['../../etc/passwd', '/etc/passwd', 'src/../../etc/passwd', 'src/missing.ts']) {
      const doc = project(snap); doc.evidence[0].path = path;
      expect(() => inspector.validate(parseLesson(doc), snap)).toThrow();
    }
    const outside = temp(); cleanup.push(outside); writeFileSync(join(outside, 'secret'), 'x'); symlinkSync(join(outside, 'secret'), join(r.root, 'src', 'link'));
    const doc = project(snap); doc.evidence[0].path = 'src/link'; expect(() => inspector.validate(parseLesson(doc), snap)).toThrow(/escapes/);
    const range = project(snap); range.evidence[0].endLine = 900; expect(() => inspector.validate(parseLesson(range), snap)).toThrow(/range/);
    const badCode = project(snap); const slide = badCode.sections[0].slides[0]; if (slide.type === 'code') slide.code = '  return false;'; expect(() => inspector.validate(parseLesson(badCode), snap)).toThrow(/excerpt/);
    const rev = project(snap); rev.evidence[0].revision = 'a'.repeat(40); expect(() => parseLesson(rev)).toThrow(/revision/);
  });
});
