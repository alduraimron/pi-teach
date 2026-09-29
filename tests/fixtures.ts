import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Lesson, Slide } from '../src/domain/lesson.ts';
import type { ProjectSnapshot } from '../src/project/git.ts';
export const temp = () => mkdtempSync(join(tmpdir(), 'teach-test-'));
export function repo(): { root: string; revision: string } {
  const root = temp();
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'auth.ts'), 'export function authenticate(token: string) {\n  return token === "secret";\n}\n');
  const run = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  run('init', '-q'); run('config', 'user.email', 'teach@example.test'); run('config', 'user.name', 'Teach Test'); run('add', '.'); run('commit', '-qm', 'fixture');
  return { root, revision: run('rev-parse', 'HEAD') };
}
const slides: Slide[] = [
  { id: 'start', type: 'title', title: 'Authentication', subtitle: 'A mental model' },
  { id: 'idea', type: 'concept', title: 'The problem', body: 'How do we identify a caller?', keyPoints: ['Inspect input', 'Decide'] },
  { id: 'example', type: 'code', title: 'One check', code: 'const valid = token === "secret";', origin: 'example', language: 'typescript' },
  { id: 'picture', type: 'diagram', title: 'Flow', format: 'mermaid', source: 'flowchart LR\n A --> B' },
  { id: 'compare', type: 'comparison', title: 'Choices', left: { heading: 'Now', body: 'Simple' }, right: { heading: 'Later', body: 'Flexible' } },
  { id: 'tab', type: 'table', title: 'Outcomes', columns: ['Input', 'Result'], rows: [['secret', 'yes']] },
  { id: 'warn', type: 'callout', title: 'Be careful', tone: 'warning', body: 'Not real security.' },
  { id: 'recap', type: 'summary', title: 'Remember', points: ['Inspect the token'] },
  { id: 'question', type: 'quiz', title: 'Check yourself', question: 'What is checked?', answer: 'The token', explanation: 'It is compared.' },
];
export function general(): Lesson { return { schemaVersion: 1, title: 'Authentication', kind: 'general', summary: 'How tokens work.', tags: ['security'], sources: [], evidence: [], sections: [{ id: 'part', title: 'The idea', slides: structuredClone(slides) }] }; }
export function project(snapshot: ProjectSnapshot): Lesson {
  return { ...general(), kind: 'project', project: { repositoryKey: snapshot.repositoryKey, revision: snapshot.revision, dirty: snapshot.dirty, name: snapshot.name, ...(snapshot.canonicalRemote ? { canonicalRemote: snapshot.canonicalRemote } : {}) }, evidence: [{ id: 'auth-source', type: 'repository', path: 'src/auth.ts', startLine: 1, endLine: 3, revision: snapshot.revision }], sections: [{ id: 'part', title: 'The implementation', slides: [{ id: 'actual', type: 'code', title: 'Authentication check', origin: 'repository', language: 'typescript', code: '  return token === "secret";', evidenceRefs: ['auth-source'] }, ...structuredClone(slides)] }] };
}
