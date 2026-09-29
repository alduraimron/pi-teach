# Storage

Storage is global to the user.

The runtime must accept an override such as an environment variable or constructor option so tests can use isolated storage.

Conceptual repository:

```text
TeachStore
├── projects
├── lessons
└── lesson revisions
```

Core operations should resemble:

```text
resolveProject(...)
createLesson(...)
appendLessonRevision(...)
getLesson(...)
listLessons(...)
searchLessons(...)
```

Persist lesson files atomically.

Never leave a database row pointing to a partially written normal lesson document.

Schema migrations must be explicit.

Do not make application startup silently destroy incompatible data.

---

## Implemented layout and migration

`src/storage/store.ts` uses Node.js 24 `node:sqlite` with `PRAGMA foreign_keys=ON`, a 5-second busy timeout and `PRAGMA user_version`. Migration 1 transactionally creates `projects`, `lessons`, `lesson_revisions`, and an updated-at index. A database with a newer version fails startup explicitly; no automatic destructive migration is allowed. Documents have a separate `schemaVersion: 1` boundary in `src/domain/lesson.ts`.

Each new lesson gets a UUID and revision 1. `append(id, document)` preserves previous JSON files and inserts the next revision number. Metadata includes the optional project FK, subject-key slot, tag JSON, source revision and dirty status; the latest document is served by `get`. Search checks lowercased title, summary, tags and project name; results are ordered by updated time and capped at 200.

Writes use an exclusively created mode-0600 temporary file under `lessons/<uuid>/`, flush its contents, rename to `<revision>.json`, then commit the metadata transaction. If the transaction fails, the temp/new document is removed and rows roll back. The document exists before any committed row can point to it. A crash after rename but before commit can leave an *unreferenced orphan document*; it never leaves a committed row pointing at a missing or partial file. V1 does not automatically garbage-collect orphan documents.

`TEACH_DATA_DIR` overrides the platform default. On Linux this is `${XDG_DATA_HOME:-~/.local/share}/teach`, on macOS `~/Library/Application Support/Teach`, and on Windows `%LOCALAPPDATA%/Teach`. `runtime/server.json` is mode 0600 and records the running loopback server's port, PID and random health token. `runtime/start.lock` serializes starts across Pi processes. Tests always inject or override the data directory; they never use the user's library.

Remote-backed project IDs hash the sanitized canonical remote. Local-only IDs hash the repository's first commit and its tree object, so moving a repository does not change identity. Clones of the same local-only history may intentionally share identity; V1 has no repository-local marker since teaching must be read-only. Paths are metadata, not identity.
