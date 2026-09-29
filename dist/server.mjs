// src/server/daemon.mjs
import { randomBytes } from "node:crypto";
import { mkdirSync as mkdirSync2, writeFileSync as writeFileSync2, readFileSync as readFileSync3, renameSync as renameSync2, unlinkSync as unlinkSync2 } from "node:fs";
import { join as join3 } from "node:path";

// src/storage/store.ts
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync, unlinkSync, readFileSync, openSync, closeSync, existsSync, fsyncSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";

// src/domain/lesson.ts
import { z } from "zod";
var text = (max = 4e3) => z.string().trim().min(1).max(max).refine((value) => !/<\/?[a-z][^>]*>|<!doctype|javascript:/i.test(value), "Presentation markup is not accepted");
var id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
var revision = z.string().regex(/^[0-9a-f]{40,64}$/);
var refs = { sourceRefs: z.array(id).max(30).optional(), evidenceRefs: z.array(id).max(30).optional() };
var base = { id, title: text(160), ...refs };
var side = z.object({ heading: text(120), body: text() }).strict();
var slideSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("title"), subtitle: text(500).optional() }).strict(),
  z.object({ ...base, type: z.literal("concept"), body: text(8e3), keyPoints: z.array(text(500)).max(12).optional() }).strict(),
  z.object({ ...base, type: z.literal("code"), code: z.string().min(1).max(12e3), language: text(40).optional(), caption: text(700).optional(), highlights: z.array(z.number().int().positive()).max(40).optional(), origin: z.enum(["example", "repository"]) }).strict(),
  z.object({ ...base, type: z.literal("diagram"), format: z.literal("mermaid"), source: text(4e3), caption: text(700).optional() }).strict(),
  z.object({ ...base, type: z.literal("comparison"), left: side, right: side }).strict(),
  z.object({ ...base, type: z.literal("table"), columns: z.array(text(120)).min(1).max(8), rows: z.array(z.array(text(600))).min(1).max(40) }).strict(),
  z.object({ ...base, type: z.literal("callout"), tone: z.enum(["info", "warning", "insight"]), body: text(4e3) }).strict(),
  z.object({ ...base, type: z.literal("summary"), points: z.array(text(700)).min(1).max(12) }).strict(),
  z.object({ ...base, type: z.literal("quiz"), question: text(1e3), options: z.array(text(400)).min(2).max(6).optional(), answer: text(1e3), explanation: text(2e3) }).strict()
]);
var sourceSchema = z.object({ id, label: text(200), url: z.string().url().max(2048).refine((value) => {
  const url = new URL(value);
  return /^https?:$/i.test(url.protocol) && !url.username && !url.password;
}, "Only HTTP(S) sources without credentials are allowed"), title: text(300).optional(), retrievedAt: z.string().datetime().optional() }).strict();
var evidenceSchema = z.object({ id, type: z.literal("repository"), path: text(500), startLine: z.number().int().positive().optional(), endLine: z.number().int().positive().optional(), revision }).strict().refine((e) => e.startLine === void 0 === (e.endLine === void 0) && (e.startLine === void 0 || e.endLine !== void 0 && e.startLine <= e.endLine), "Line ranges must be complete and ordered");
var projectSchema = z.object({ repositoryKey: text(160), name: text(160), revision, dirty: z.boolean(), canonicalRemote: z.string().max(500).optional() }).strict();
var common = {
  schemaVersion: z.literal(1),
  title: text(200),
  summary: text(1500),
  tags: z.array(text(60)).max(20),
  sections: z.array(z.object({ id, title: text(160), slides: z.array(slideSchema).min(1).max(60) }).strict()).min(1).max(25),
  sources: z.array(sourceSchema).max(60)
};
var lessonSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("general"), evidence: z.array(evidenceSchema).length(0).default([]) }).strict(),
  z.object({ ...common, kind: z.literal("project"), project: projectSchema, evidence: z.array(evidenceSchema).min(1).max(150) }).strict()
]);
function parseLesson(input) {
  if (typeof input !== "object" || input === null || input.schemaVersion !== 1) {
    throw new Error("Unsupported Teach lesson schema version");
  }
  const lesson = lessonSchema.parse(input);
  const ids = /* @__PURE__ */ new Set();
  const sources = /* @__PURE__ */ new Set();
  const evidence = /* @__PURE__ */ new Set();
  const unique = (key) => {
    if (ids.has(key)) throw new Error(`Duplicate ID: ${key}`);
    ids.add(key);
  };
  for (const source of lesson.sources) {
    unique(source.id);
    sources.add(source.id);
  }
  for (const item of lesson.evidence) {
    unique(item.id);
    evidence.add(item.id);
    if (!safeRelativePath(item.path)) throw new Error(`Unsafe evidence path: ${item.path}`);
    if (lesson.kind === "project" && item.revision !== lesson.project.revision) throw new Error("Evidence revision mismatch");
  }
  for (const section of lesson.sections) {
    unique(section.id);
    for (const slide of section.slides) {
      unique(slide.id);
      if (slide.sourceRefs?.some((ref) => !sources.has(ref))) throw new Error(`Unknown source reference in ${slide.id}`);
      if (slide.evidenceRefs?.some((ref) => !evidence.has(ref))) throw new Error(`Unknown evidence reference in ${slide.id}`);
      if (lesson.kind === "general" && slide.evidenceRefs?.length) throw new Error("General lesson cannot reference repository evidence");
      if (slide.type === "code" && slide.origin === "repository" && (!slide.evidenceRefs?.length || lesson.kind !== "project")) throw new Error("Repository code requires project evidence");
      if (slide.type === "table" && slide.rows.some((row) => row.length !== slide.columns.length)) throw new Error("Table row width mismatch");
      if (slide.type === "code" && slide.highlights?.some((n) => n > slide.code.split("\n").length)) throw new Error("Code highlight out of range");
      if (slide.type === "diagram" && /\b(click|href|callback|linkStyle)\b|<\s*[a-z/!?]|javascript:|%%\s*\{/i.test(slide.source)) throw new Error("Unsafe Mermaid source");
    }
  }
  if (lesson.kind === "project" && !lesson.sections.some((s) => s.slides.some((slide) => slide.type === "code" && slide.origin === "repository"))) throw new Error("Project lesson needs representative repository code");
  return lesson;
}
function safeRelativePath(path) {
  return path.length > 0 && !path.includes("\\") && !path.includes("\0") && !path.startsWith("/") && !/^[a-z]:/i.test(path) && path.split("/").every((p) => p !== "" && p !== "." && p !== "..");
}

// src/storage/store.ts
function dataDirectory(env = process.env) {
  if (env.TEACH_DATA_DIR) {
    if (!isAbsolute(env.TEACH_DATA_DIR)) throw new Error("TEACH_DATA_DIR must be absolute");
    return env.TEACH_DATA_DIR;
  }
  const home = env.HOME ?? env.USERPROFILE;
  if (!home) throw new Error("No home directory; configure TEACH_DATA_DIR");
  if (process.platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "Teach");
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "Teach");
  return join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), "teach");
}
var migration1 = `
CREATE TABLE projects (id TEXT PRIMARY KEY, repository_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, canonical_remote TEXT, first_seen_path TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE lessons (id TEXT PRIMARY KEY, slug TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('general','project')), subject_key TEXT, project_id TEXT REFERENCES projects(id), summary TEXT NOT NULL, tags TEXT NOT NULL, schema_version INTEGER NOT NULL, source_revision TEXT, dirty INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE lesson_revisions (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id), revision_number INTEGER NOT NULL, document_path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, UNIQUE(lesson_id,revision_number));
CREATE INDEX lessons_updated ON lessons(updated_at DESC);
`;
function rowMeta(row) {
  return { id: String(row.id), slug: String(row.slug), title: String(row.title), kind: row.kind, summary: String(row.summary), tags: JSON.parse(String(row.tags)), ...row.project_name ? { projectName: String(row.project_name) } : {}, ...row.source_revision ? { sourceRevision: String(row.source_revision) } : {}, ...row.dirty === null ? {} : { dirty: Boolean(row.dirty) }, createdAt: String(row.created_at), updatedAt: String(row.updated_at), revisionNumber: Number(row.revision_number) };
}
var SqliteTeachStore = class {
  db;
  directory;
  constructor(directory2 = dataDirectory()) {
    this.directory = directory2;
    mkdirSync(join(directory2, "lessons"), { recursive: true, mode: 448 });
    this.db = new DatabaseSync(join(directory2, "teach.db"));
    this.db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    const version = Number(this.db.prepare("PRAGMA user_version").get().user_version);
    if (version > 1) {
      this.db.close();
      throw new Error(`Teach database version ${version} is newer than supported version 1`);
    }
    if (version === 0) {
      this.db.exec("BEGIN IMMEDIATE");
      try {
        this.db.exec(migration1);
        this.db.exec("PRAGMA user_version=1");
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        this.db.close();
        throw error;
      }
    }
  }
  close() {
    this.db.close();
  }
  create(lesson, snapshot) {
    return this.save(void 0, lesson, snapshot);
  }
  append(id2, lesson, snapshot) {
    if (!/^[0-9a-f-]{36}$/.test(id2)) throw new Error("Invalid lesson ID");
    return this.save(id2, lesson, snapshot);
  }
  save(existingId, input, snapshot) {
    const lesson = parseLesson(input);
    if (lesson.kind === "project" && (!snapshot || snapshot.repositoryKey !== lesson.project.repositoryKey)) throw new Error("Project snapshot required");
    if (lesson.kind === "general" && snapshot) throw new Error("General lesson cannot have project snapshot");
    const id2 = existingId ?? randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const slug = lesson.title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "lesson";
    let path = "";
    let temp = "";
    let completed = false;
    let fileCreated = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old = existingId ? this.db.prepare("SELECT kind, project_id FROM lessons WHERE id=?").get(id2) : void 0;
      if (existingId && !old) throw new Error("Lesson does not exist");
      let projectId = null;
      if (lesson.kind === "project" && snapshot) {
        const found = this.db.prepare("SELECT id FROM projects WHERE repository_key=?").get(snapshot.repositoryKey);
        projectId = found?.id ?? randomUUID();
        if (!found) this.db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?)").run(projectId, snapshot.repositoryKey, snapshot.name, snapshot.canonicalRemote ?? null, snapshot.root, now, now);
        else this.db.prepare("UPDATE projects SET name=?, updated_at=? WHERE id=?").run(snapshot.name, now, projectId);
      }
      if (old && (old.kind !== lesson.kind || old.project_id !== projectId)) throw new Error("Cannot change lesson kind or project");
      const revisionNumber = old ? Number(this.db.prepare("SELECT COALESCE(MAX(revision_number),0)+1 AS n FROM lesson_revisions WHERE lesson_id=?").get(id2).n) : 1;
      path = join(this.directory, "lessons", id2, `${revisionNumber}.json`);
      temp = `${path}.${randomUUID()}.tmp`;
      mkdirSync(dirname(path), { recursive: true, mode: 448 });
      const fd = openSync(temp, "wx", 384);
      try {
        writeFileSync(fd, JSON.stringify(lesson, null, 2));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      if (existsSync(path)) throw new Error("Revision file already exists");
      renameSync(temp, path);
      fileCreated = true;
      if (old) this.db.prepare("UPDATE lessons SET title=?, slug=?, summary=?, tags=?, source_revision=?, dirty=?, updated_at=? WHERE id=?").run(lesson.title, slug, lesson.summary, JSON.stringify(lesson.tags), lesson.kind === "project" ? lesson.project.revision : null, lesson.kind === "project" ? Number(lesson.project.dirty) : null, now, id2);
      else this.db.prepare("INSERT INTO lessons VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id2, slug, lesson.title, lesson.kind, null, projectId, lesson.summary, JSON.stringify(lesson.tags), 1, lesson.kind === "project" ? lesson.project.revision : null, lesson.kind === "project" ? Number(lesson.project.dirty) : null, now, now);
      this.db.prepare("INSERT INTO lesson_revisions VALUES (?,?,?,?,?)").run(randomUUID(), id2, revisionNumber, join("lessons", id2, `${revisionNumber}.json`), now);
      this.db.exec("COMMIT");
      completed = true;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      if (!completed) {
        for (const p of [temp, ...fileCreated ? [path] : []]) if (p) try {
          unlinkSync(p);
        } catch {
        }
      }
    }
    return this.get(id2);
  }
  get(id2) {
    if (!/^[0-9a-f-]{36}$/.test(id2)) return void 0;
    const row = this.db.prepare(`SELECT l.*, p.name AS project_name, r.revision_number, r.document_path FROM lessons l LEFT JOIN projects p ON l.project_id=p.id JOIN lesson_revisions r ON r.lesson_id=l.id AND r.revision_number=(SELECT MAX(revision_number) FROM lesson_revisions WHERE lesson_id=l.id) WHERE l.id=?`).get(id2);
    if (!row) return void 0;
    const document = parseLesson(JSON.parse(readFileSync(join(this.directory, String(row.document_path)), "utf8")));
    return { meta: rowMeta(row), document };
  }
  list(query = "") {
    const escaped = query.trim().toLowerCase().replace(/[\\%_]/g, "\\$&");
    const rows = this.db.prepare(`SELECT l.*, p.name AS project_name, (SELECT MAX(revision_number) FROM lesson_revisions WHERE lesson_id=l.id) AS revision_number FROM lessons l LEFT JOIN projects p ON l.project_id=p.id WHERE lower(l.title) LIKE ? ESCAPE '\\' OR lower(l.summary) LIKE ? ESCAPE '\\' OR lower(l.tags) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.name,'')) LIKE ? ESCAPE '\\' ORDER BY l.updated_at DESC LIMIT 200`).all(...Array(4).fill(`%${escaped}%`));
    return rows.map(rowMeta);
  }
};

// src/server/http.ts
import { createServer } from "node:http";
import { readFileSync as readFileSync2, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
function makeServer(store2, assetRoot, token2) {
  return createServer((req, res) => {
    const host = req.headers.host ?? "";
    const port = req.socket.address().port;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'none'");
    let isApi = false;
    try {
      const url = new URL(req.url ?? "/", `http://${host}`);
      isApi = url.pathname.startsWith("/api/");
      if (url.pathname === "/api/health") {
        if (req.headers["x-teach-token"] !== token2) {
          res.writeHead(403).end();
          return;
        }
        json(res, { ok: true });
        return;
      }
      if (url.pathname === "/api/lessons") {
        json(res, store2.list(url.searchParams.get("q") ?? ""));
        return;
      }
      if (url.pathname.startsWith("/api/lessons/")) {
        const id2 = url.pathname.slice("/api/lessons/".length);
        const lesson = store2.get(id2);
        if (!lesson) {
          res.writeHead(404).end();
          return;
        }
        json(res, lesson);
        return;
      }
      let file = "index.html";
      if (url.pathname.startsWith("/assets/") && /^\/assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) file = url.pathname.slice(1);
      else if (url.pathname !== "/" && !/^\/lesson\/[0-9a-f-]{36}$/.test(url.pathname)) {
        res.writeHead(404).end();
        return;
      }
      const path = resolve(assetRoot, file);
      if (!path.startsWith(resolve(assetRoot) + sep) || !statSync(path).isFile()) {
        res.writeHead(404).end();
        return;
      }
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
      res.setHeader("Content-Type", `${mime[extname(path)] ?? "application/octet-stream"}; charset=utf-8`);
      res.end(req.method === "HEAD" ? void 0 : readFileSync2(path));
    } catch {
      res.writeHead(isApi ? 500 : 404).end();
    }
  });
}
function json(res, value) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

// src/server/daemon.mjs
var directory = process.env.TEACH_DATA_DIR;
var assets = process.env.TEACH_ASSET_ROOT;
if (!directory || !assets) throw new Error("TEACH_DATA_DIR and TEACH_ASSET_ROOT are required");
var store = new SqliteTeachStore(directory);
var token = randomBytes(32).toString("hex");
var server = makeServer(store, assets, token);
var runtime = join3(directory, "runtime");
mkdirSync2(runtime, { recursive: true, mode: 448 });
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to bind Teach");
  const tmp = join3(runtime, `server.${process.pid}.tmp`);
  writeFileSync2(tmp, JSON.stringify({ port: address.port, pid: process.pid, token }), { mode: 384 });
  renameSync2(tmp, join3(runtime, "server.json"));
});
function stop() {
  try {
    const file = join3(runtime, "server.json");
    if (JSON.parse(readFileSync3(file, "utf8")).pid === process.pid) unlinkSync2(file);
  } catch {
  }
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
