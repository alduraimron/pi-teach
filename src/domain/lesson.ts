import { z } from 'zod';

const text = (max = 4000) => z.string().trim().min(1).max(max).refine(value => !/<\/?[a-z][^>]*>|<!doctype|javascript:/i.test(value), 'Presentation markup is not accepted');
const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const revision = z.string().regex(/^[0-9a-f]{40,64}$/);
const refs = { sourceRefs: z.array(id).max(30).optional(), evidenceRefs: z.array(id).max(30).optional() };
const base = { id, title: text(160), ...refs };
const side = z.object({ heading: text(120), body: text() }).strict();
export const slideSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('title'), subtitle: text(500).optional() }).strict(),
  z.object({ ...base, type: z.literal('concept'), body: text(8000), keyPoints: z.array(text(500)).max(12).optional() }).strict(),
  z.object({ ...base, type: z.literal('code'), code: z.string().min(1).max(12000), language: text(40).optional(), caption: text(700).optional(), highlights: z.array(z.number().int().positive()).max(40).optional(), origin: z.enum(['example', 'repository']) }).strict(),
  z.object({ ...base, type: z.literal('diagram'), format: z.literal('mermaid'), source: text(4000), caption: text(700).optional() }).strict(),
  z.object({ ...base, type: z.literal('comparison'), left: side, right: side }).strict(),
  z.object({ ...base, type: z.literal('table'), columns: z.array(text(120)).min(1).max(8), rows: z.array(z.array(text(600))).min(1).max(40) }).strict(),
  z.object({ ...base, type: z.literal('callout'), tone: z.enum(['info', 'warning', 'insight']), body: text(4000) }).strict(),
  z.object({ ...base, type: z.literal('summary'), points: z.array(text(700)).min(1).max(12) }).strict(),
  z.object({ ...base, type: z.literal('quiz'), question: text(1000), options: z.array(text(400)).min(2).max(6).optional(), answer: text(1000), explanation: text(2000) }).strict(),
]);
const sourceSchema = z.object({ id, label: text(200), url: z.string().url().max(2048).refine(value => { const url = new URL(value); return /^https?:$/i.test(url.protocol) && !url.username && !url.password; }, 'Only HTTP(S) sources without credentials are allowed'), title: text(300).optional(), retrievedAt: z.string().datetime().optional() }).strict();
const evidenceSchema = z.object({ id, type: z.literal('repository'), path: text(500), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional(), revision }).strict().refine(e => (e.startLine === undefined) === (e.endLine === undefined) && (e.startLine === undefined || e.endLine !== undefined && e.startLine <= e.endLine), 'Line ranges must be complete and ordered');
const projectSchema = z.object({ repositoryKey: text(160), name: text(160), revision, dirty: z.boolean(), canonicalRemote: z.string().max(500).optional() }).strict();
const common = {
  schemaVersion: z.literal(1), title: text(200), summary: text(1500), tags: z.array(text(60)).max(20),
  sections: z.array(z.object({ id, title: text(160), slides: z.array(slideSchema).min(1).max(60) }).strict()).min(1).max(25),
  sources: z.array(sourceSchema).max(60),
};
export const lessonSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('general'), evidence: z.array(evidenceSchema).length(0).default([]) }).strict(),
  z.object({ ...common, kind: z.literal('project'), project: projectSchema, evidence: z.array(evidenceSchema).min(1).max(150) }).strict(),
]);
export type Lesson = z.infer<typeof lessonSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type ProjectData = z.infer<typeof projectSchema>;

// New document versions must be explicitly migrated before reading. Never reinterpret old data.
export function parseLesson(input: unknown): Lesson {
  if (typeof input !== 'object' || input === null || (input as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new Error('Unsupported Teach lesson schema version');
  }
  const lesson = lessonSchema.parse(input);
  const ids = new Set<string>();
  const sources = new Set<string>();
  const evidence = new Set<string>();
  const unique = (key: string) => { if (ids.has(key)) throw new Error(`Duplicate ID: ${key}`); ids.add(key); };
  for (const source of lesson.sources) {
    unique(source.id);
    sources.add(source.id);
  }
  for (const item of lesson.evidence) {
    unique(item.id);
    evidence.add(item.id);
    if (!safeRelativePath(item.path)) throw new Error(`Unsafe evidence path: ${item.path}`);
    if (lesson.kind === 'project' && item.revision !== lesson.project.revision) throw new Error('Evidence revision mismatch');
  }
  for (const section of lesson.sections) {
    unique(section.id);
    for (const slide of section.slides) {
      unique(slide.id);
      if (slide.sourceRefs?.some(ref => !sources.has(ref))) throw new Error(`Unknown source reference in ${slide.id}`);
      if (slide.evidenceRefs?.some(ref => !evidence.has(ref))) throw new Error(`Unknown evidence reference in ${slide.id}`);
      if (lesson.kind === 'general' && slide.evidenceRefs?.length) throw new Error('General lesson cannot reference repository evidence');
      if (slide.type === 'code' && slide.origin === 'repository' && (!slide.evidenceRefs?.length || lesson.kind !== 'project')) throw new Error('Repository code requires project evidence');
      if (slide.type === 'table' && slide.rows.some(row => row.length !== slide.columns.length)) throw new Error('Table row width mismatch');
      if (slide.type === 'code' && slide.highlights?.some(n => n > slide.code.split('\n').length)) throw new Error('Code highlight out of range');
      if (slide.type === 'diagram' && /\b(click|href|callback|linkStyle)\b|<\s*[a-z/!?]|javascript:|%%\s*\{/i.test(slide.source)) throw new Error('Unsafe Mermaid source');
    }
  }
  if (lesson.kind === 'project' && !lesson.sections.some(s => s.slides.some(slide => slide.type === 'code' && slide.origin === 'repository'))) throw new Error('Project lesson needs representative repository code');
  return lesson;
}

export function safeRelativePath(path: string): boolean {
  return path.length > 0 && !path.includes('\\') && !path.includes('\0') && !path.startsWith('/') && !/^[a-z]:/i.test(path) && path.split('/').every(p => p !== '' && p !== '.' && p !== '..');
}
