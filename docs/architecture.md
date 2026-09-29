# Teach Architecture

## Context

Teach transforms a user's learning request into a persistent, navigable lesson.

There are two primary use cases.

### General knowledge

The source of truth is established knowledge and, when necessary, external research.

Example:

```text
/teach how BGP route selection works
```

### Project knowledge

The source of truth includes the repository currently being examined.

Example:

```text
/teach explain how components are implemented in this project
```

These use cases share lesson generation and presentation but differ substantially in evidence acquisition.

---

## Main Boundary

Teach deliberately separates:

```text
intelligence
execution
persistence
presentation
```

### Intelligence

Pi agent + Teach skill.

Answers:

- What should be investigated?
- What does the learner need to understand?
- What teaching sequence is effective?
- Which evidence should support an explanation?

### Execution

Teach extension/runtime.

Answers:

- What project are we in?
- What deterministic tools does the agent receive?
- Is generated lesson data valid?
- Where is it stored?
- How is the browser/server started?

### Persistence

SQLite + structured lesson files.

Answers:

- Which lessons exist?
- Which revision is current?
- Which project does this lesson belong to?

### Presentation

Teach Web.

Answers:

- How does a concept slide look?
- How is code highlighted?
- How are diagrams rendered?
- How does keyboard navigation work?

No layer should absorb all four responsibilities.

---

## Agent Contract

The model should not write directly to the database.

Preferred interaction:

```text
Extension
  └─ exposes generation context/tools

Agent
  └─ investigates
  └─ produces LessonDraft

Runtime
  └─ parses LessonDraft
  └─ validates
  └─ persists
```

The implementation may use a temporary JSON artifact or tool submission boundary, depending on Pi APIs.

The important invariant is:

**the runtime validates the complete lesson before it becomes library data.**

---

## Tool Surface

Avoid giving the agent a large Teach-specific tool suite.

Prefer existing Pi read/search/bash capabilities for repository understanding when safe.

Teach-specific tools should exist only where deterministic integration is valuable.

Candidate minimal capabilities:

```text
teach_project_context
teach_submit_lesson
```

Potentially:

```text
teach_get_existing_lessons
```

only if needed for future extension behavior.

Do not recreate generic file-reading tools.

---

## General vs Project Detection

Classification may use:

- wording such as "this project", "this repository", "here", specific internal symbols;
- whether repository context is actually needed to answer accurately.

A request made inside a repository is NOT automatically a project lesson.

Example:

```text
/teach what is a mutex
```

inside a repository remains general unless the user requests repository-specific treatment.

Conversely:

```text
/teach why do we use mutexes here
```

requires project investigation.

---

## Project Context

At generation start capture an immutable context:

```text
repository root
repository key
display name
HEAD revision
dirty state
canonical remote if safe
```

Lesson evidence should be interpreted relative to that captured context.

V1 may document when a repository is dirty.

Do not pretend that a dirty worktree is represented completely by HEAD alone.

A project lesson generated from a dirty tree should record that fact.

---

## Lesson Revision Semantics

Every saved change creates a new lesson revision.

Do not destructively overwrite historical lesson documents.

V1 can display only the latest revision.

The revision model exists now so future updates can append rather than erase history.

---

## Rendering Architecture

Do not compile arbitrary lesson-generated React.

Use a registry:

```text
slide.type
  ↓
renderer registry
  ↓
known React component
```

Example:

```text
concept    -> ConceptSlide
code       -> CodeSlide
diagram    -> DiagramSlide
table      -> TableSlide
quiz       -> QuizSlide
```

Unknown slide types fail clearly.

---

## Search

V1 does not need semantic search.

A simple database query over normalized title, summary, tags, and project display name is sufficient.

The storage contract should permit richer search later.

---

## Decisions

### ADR-001: Structured lessons instead of generated HTML

Status: Accepted.

Reason:

- deterministic UI
- security
- schema validation
- consistent appearance
- renderer upgrades apply to existing lessons
- content remains portable

### ADR-002: Global store instead of repository-local lessons

Status: Accepted.

Reason:

Teach is a personal learning library spanning repositories and general knowledge.

Repository identity remains metadata on project lessons.

### ADR-003: SQLite metadata plus versioned lesson documents

Status: Accepted.

Reason:

SQLite provides reliable indexing/querying while JSON lesson documents remain easy to validate, migrate, inspect, and render.

### ADR-004: Repository evidence is first-class

Status: Accepted.

Reason:

Project teaching without traceability quickly becomes stale or hallucinatory.

### ADR-005: Skill + extension in one Pi package

Status: Accepted.

Reason:

The skill owns teaching behavior.

The extension owns executable integration and deterministic runtime behavior.

The package gives one installation unit.

---

## V1 implementation decisions

- `package.json` declares the Pi extension and skill. `/teach` sends the bundled skill text to the **current Pi agent** (not a new model process), plus the immutable generation ID, classification and optional Git snapshot. The command restricts active tools to reading/search and `teach_submit_lesson` during the generation; the submission tool verifies session and generation ID. The tool accepts only a JSON-serialized draft string (`draftJson`) and parses it before runtime validation; no model-controlled filesystem destination exists. Failed validation leaves the generation pending so the agent can repair and resubmit. An agent run that settles without a valid submission saves nothing. This is read-only at the Teach tool boundary, not an OS sandbox for arbitrary third-party extensions.
- V1 classifies explicit repository cues before starting. Ambiguous requests without such cues are general. Classification is a deliberately conservative heuristic; mixed/ambiguous requests may need clearer wording. Runtime rejects a lesson whose kind disagrees with the captured intent. Git metadata is resolved independently of the agent.
- The only Teach-specific model tool is `teach_submit_lesson`. Project snapshot is provided at generation start, avoiding a redundant repository-reading tool. Evidence paths, line ranges and exact repository code excerpts are validated at submission time.
- The Pi extension uses Pi's supported TypeScript extension loader. Node.js does not strip TypeScript under `node_modules`, so the long-lived server entrypoint and its runtime imports are bundled as `dist/server.mjs` with esbuild at packaging time. The browser UI is built by Vite and shipped as static assets. The SQLite module is Node's built-in `node:sqlite`, so there is no native binary package install step.
- `/teach open` checks a token-authenticated health endpoint, uses a short-lived cross-process startup lock and launches a detached loopback-only process on an OS-selected port. It does not spawn a new server when the existing one is healthy. The server continues after Pi exits.
- General source URLs are HTTP(S) without credentials. Lesson prose is plain text and unsafe markup is rejected; code is displayed as escaped/sanitized, never executed. Mermaid is rendered with strict security settings and its SVG is sanitized before display. Browser-facing IDs and Host headers are checked.
- V1 does not expose a command to append to an existing lesson. Storage implements append-only revisions for future updates; ordinary `/teach <request>` creates a new lesson.
