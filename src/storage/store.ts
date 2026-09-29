import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, unlinkSync, readFileSync, openSync, closeSync, existsSync, fsyncSync } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import type { Lesson } from '../domain/lesson.ts';
import { parseLesson } from '../domain/lesson.ts';
import type { ProjectSnapshot } from '../project/git.ts';

export interface LessonListItem { id: string; slug: string; title: string; kind: 'general' | 'project'; summary: string; tags: string[]; projectName?: string; sourceRevision?: string; dirty?: boolean; createdAt: string; updatedAt: string; revisionNumber: number }
export interface SavedLesson { meta: LessonListItem; document: Lesson }
export interface TeachStore { create(lesson: Lesson, snapshot?: ProjectSnapshot): SavedLesson; append(id: string, lesson: Lesson, snapshot?: ProjectSnapshot): SavedLesson; get(id: string): SavedLesson | undefined; list(query?: string): LessonListItem[]; close(): void }
export function dataDirectory(env = process.env): string {
  if (env.TEACH_DATA_DIR) {
    if (!isAbsolute(env.TEACH_DATA_DIR)) throw new Error('TEACH_DATA_DIR must be absolute');
    return env.TEACH_DATA_DIR;
  }
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) throw new Error('No home directory; configure TEACH_DATA_DIR');
  if (process.platform === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Teach');
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'Teach');
  return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'teach');
}
const migration1 = `
CREATE TABLE projects (id TEXT PRIMARY KEY, repository_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, canonical_remote TEXT, first_seen_path TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE lessons (id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('general','project')), subject_key TEXT, project_id TEXT REFERENCES projects(id), summary TEXT NOT NULL, tags TEXT NOT NULL, schema_version INTEGER NOT NULL, source_revision TEXT, dirty INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE lesson_revisions (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id), revision_number INTEGER NOT NULL, document_path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, UNIQUE(lesson_id,revision_number));
CREATE INDEX lessons_updated ON lessons(updated_at DESC);
`;
function rowMeta(row: Record<string, unknown>): LessonListItem {
  return { id: String(row.id), slug: String(row.slug), title: String(row.title), kind: row.kind as 'general' | 'project', summary: String(row.summary), tags: JSON.parse(String(row.tags)) as string[], ...(row.project_name ? { projectName: String(row.project_name) } : {}), ...(row.source_revision ? { sourceRevision: String(row.source_revision) } : {}), ...(row.dirty === null ? {} : { dirty: Boolean(row.dirty) }), createdAt: String(row.created_at), updatedAt: String(row.updated_at), revisionNumber: Number(row.revision_number) };
}
export class SqliteTeachStore implements TeachStore {
  private db: DatabaseSync;
  readonly directory: string;
  constructor(directory: string = dataDirectory()) {
    this.directory = directory;
    mkdirSync(join(directory, 'lessons'), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'teach.db'));
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    const version = Number((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
    if (version > 1) { this.db.close(); throw new Error(`Teach database version ${version} is newer than supported version 1`); }
    if (version === 0) {
      this.db.exec('BEGIN IMMEDIATE');
      try { this.db.exec(migration1); this.db.exec('PRAGMA user_version=1'); this.db.exec('COMMIT'); }
      catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    }
  }
  close(): void { this.db.close(); }
  create(lesson: Lesson, snapshot?: ProjectSnapshot): SavedLesson { return this.save(undefined, lesson, snapshot); }
  append(id: string, lesson: Lesson, snapshot?: ProjectSnapshot): SavedLesson {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid lesson ID');
    return this.save(id, lesson, snapshot);
  }
  private save(existingId: string | undefined, input: Lesson, snapshot?: ProjectSnapshot): SavedLesson {
    const lesson = parseLesson(input);
    if (lesson.kind === 'project' && (!snapshot || snapshot.repositoryKey !== lesson.project.repositoryKey)) throw new Error('Project snapshot required');
    if (lesson.kind === 'general' && snapshot) throw new Error('General lesson cannot have project snapshot');
    const id = existingId ?? randomUUID();
    const now = new Date().toISOString();
    const slug = lesson.title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'lesson';
    let path = '';
    let temp = '';
    let completed = false;
    let fileCreated = false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const old = existingId ? this.db.prepare('SELECT kind, project_id FROM lessons WHERE id=?').get(id) as {kind: string; project_id: string | null} | undefined : undefined;
      if (existingId && !old) throw new Error('Lesson does not exist');
      let projectId: string | null = null;
      if (lesson.kind === 'project' && snapshot) {
        const found = this.db.prepare('SELECT id FROM projects WHERE repository_key=?').get(snapshot.repositoryKey) as {id: string} | undefined;
        projectId = found?.id ?? randomUUID();
        if (!found) this.db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?)').run(projectId, snapshot.repositoryKey, snapshot.name, snapshot.canonicalRemote ?? null, snapshot.root, now, now);
        else this.db.prepare('UPDATE projects SET name=?, updated_at=? WHERE id=?').run(snapshot.name, now, projectId);
      }
      if (old && (old.kind !== lesson.kind || old.project_id !== projectId)) throw new Error('Cannot change lesson kind or project');
      const revisionNumber = old ? Number((this.db.prepare('SELECT COALESCE(MAX(revision_number),0)+1 AS n FROM lesson_revisions WHERE lesson_id=?').get(id) as {n: number}).n) : 1;
      path = join(this.directory, 'lessons', id, `${revisionNumber}.json`);
      temp = `${path}.${randomUUID()}.tmp`;
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      const fd = openSync(temp, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify(lesson, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
      if (existsSync(path)) throw new Error('Revision file already exists');
      renameSync(temp, path); // File exists before the database can point to it.
      fileCreated = true;
      if (old) this.db.prepare('UPDATE lessons SET title=?, slug=?, summary=?, tags=?, source_revision=?, dirty=?, updated_at=? WHERE id=?').run(lesson.title, slug, lesson.summary, JSON.stringify(lesson.tags), lesson.kind === 'project' ? lesson.project.revision : null, lesson.kind === 'project' ? Number(lesson.project.dirty) : null, now, id);
      else this.db.prepare('INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, slug, lesson.title, lesson.kind, null, projectId, lesson.summary, JSON.stringify(lesson.tags), 1, lesson.kind === 'project' ? lesson.project.revision : null, lesson.kind === 'project' ? Number(lesson.project.dirty) : null, now, now);
      this.db.prepare('INSERT INTO lesson_revisions VALUES (?,?,?,?,?)').run(randomUUID(), id, revisionNumber, join('lessons', id, `${revisionNumber}.json`), now);
      this.db.exec('COMMIT'); completed = true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    finally { if (!completed) { for (const p of [temp, ...(fileCreated ? [path] : [])]) if (p) try { unlinkSync(p); } catch { /* absent */ } } }
    return this.get(id)!;
  }
  get(id: string): SavedLesson | undefined {
    if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
    const row = this.db.prepare(`SELECT l.*, p.name AS project_name, r.revision_number, r.document_path FROM lessons l LEFT JOIN projects p ON l.project_id=p.id JOIN lesson_revisions r ON r.lesson_id=l.id AND r.revision_number=(SELECT MAX(revision_number) FROM lesson_revisions WHERE lesson_id=l.id) WHERE l.id=?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    // document_path comes from our own DB, never from a model or URL.
    const document = parseLesson(JSON.parse(readFileSync(join(this.directory, String(row.document_path)), 'utf8')));
    return { meta: rowMeta(row), document };
  }
  list(query = ''): LessonListItem[] {
    const escaped = query.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
    const rows = this.db.prepare(`SELECT l.*, p.name AS project_name, (SELECT MAX(revision_number) FROM lesson_revisions WHERE lesson_id=l.id) AS revision_number FROM lessons l LEFT JOIN projects p ON l.project_id=p.id WHERE lower(l.title) LIKE ? ESCAPE '\\' OR lower(l.summary) LIKE ? ESCAPE '\\' OR lower(l.tags) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.name,'')) LIKE ? ESCAPE '\\' ORDER BY l.updated_at DESC LIMIT 200`).all(...Array(4).fill(`%${escaped}%`)) as Record<string, unknown>[];
    return rows.map(rowMeta);
  }
}
