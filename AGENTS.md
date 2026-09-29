# Teach

Teach is a persistent learning system for Pi.

Its purpose is not merely to generate presentations. Teach turns questions, repository knowledge, code, diagrams, and explanations into structured lessons that live in one global web library.

A user should be able to invoke Teach from any directory or repository and later browse all generated material from the same web application.

## Product Principles

### 1. Optimize for understanding

Teach is a teaching system, not a summarizer.

Prefer:

problem → intuition → mental model → mechanism → concrete example → real implementation → edge cases → verification

over:

definition → bullet list → advantages → summary

Do not optimize for maximum information density.

### 2. Content and presentation are separate

The agent MUST NOT generate arbitrary presentation HTML/CSS for individual lessons.

The agent produces a structured lesson document conforming to Teach's lesson schema.

A deterministic web renderer owns layout, typography, navigation, themes, syntax highlighting, diagrams, and reusable slide components.

### 3. Project knowledge must be evidence-backed

For project-aware lessons, important claims about the repository MUST be traceable to concrete repository evidence.

Evidence should reference:

- repository-relative file path
- line range when practical
- git revision used for investigation

Never invent code or present illustrative code as repository code.

Generated examples must be explicitly identified as examples.

### 4. Teach is globally persistent

Lessons are not owned by the current repository.

Running Teach from different directories contributes to the same global library.

Repository-aware lessons retain their project identity and revision metadata.

### 5. Teach is incremental

The architecture must allow future lessons to:

- extend existing subjects,
- supersede stale material,
- relate to other lessons,
- form courses/topics,
- retain historical versions.

V1 does not need sophisticated automatic merging, but its persistence model MUST NOT prevent it.

### 6. Repository access is read-only by default

Teaching about a project must not modify that project.

Project inspection may read:

- source files
- configuration
- documentation
- dependency manifests
- git metadata

It may execute safe read-only discovery commands when necessary.

It MUST NOT modify project files merely to produce a lesson.

### 7. Stable contracts over clever generation

Prefer explicit schemas, discriminated unions, deterministic storage, and deterministic rendering.

Do not rely on prompts to enforce behavior that can be validated in code.

---

# Product Surface

V1 exposes two primary commands:

```text
/teach <request>
/teach open
```

Examples:

```text
/teach explain how TCP congestion control works
/teach teach me dependency injection from first principles
/teach explain how authentication works in this project
/teach explain the component architecture in this repository
/teach open
```

`/teach <request>` creates a lesson.

`/teach open` starts or reuses the Teach web server and opens the global library.

Natural language determines whether the request requires general knowledge or project-aware investigation.

Do not require users to learn separate commands for those modes.

---

# Package Boundary

Teach SHOULD be implemented as one installable Pi package.

Recommended layout:

```text
pi-teach/
├── package.json
├── README.md
├── AGENTS.md
├── docs/
│   ├── architecture.md
│   ├── lesson-format.md
│   └── storage.md
├── extensions/
│   └── teach/
│       ├── index.ts
│       └── ...
├── skills/
│   └── teach/
│       ├── SKILL.md
│       └── references/
├── src/
│   ├── domain/
│   ├── storage/
│   ├── project/
│   ├── lesson/
│   ├── server/
│   └── shared/
├── web/
│   └── ...
└── tests/
```

Exact folders may be adjusted to match the chosen build system, but preserve the architectural boundaries.

Teach MUST be installable using Pi package mechanisms rather than requiring users to manually copy unrelated files.

---

# Architecture

Teach consists of five conceptual layers:

```text
Pi
 │
 ▼
Teach Extension
 │
 ├─────────────► Teach Skill / teaching instructions
 │
 ▼
Lesson Runtime
 │
 ├── request classification
 ├── project resolution
 ├── evidence collection
 ├── lesson validation
 └── persistence
 │
 ▼
Global Teach Store
 │
 ▼
Teach Web Application
```

## Pi Extension

Responsibilities:

- register `/teach`
- parse command intent
- invoke the active Pi agent when lesson generation is required
- expose deterministic Teach-specific tools to the agent
- validate generated lessons
- persist completed lessons
- manage the web server lifecycle
- open the Teach web UI
- provide concise progress/errors in Pi

It must remain thin.

Pedagogy belongs in the skill.

Storage semantics belong in the runtime.

Rendering belongs in the web app.

---

# Teach Skill

Path:

```text
skills/teach/SKILL.md
```

The skill defines how the agent:

- teaches concepts,
- investigates repositories,
- collects evidence,
- structures lessons,
- distinguishes facts from examples,
- avoids superficial slide writing,
- chooses diagrams/code/examples,
- handles uncertainty.

It MUST NOT contain application persistence logic.

It MUST NOT ask the model to hand-write the Teach database.

It MUST NOT ask the model to generate arbitrary web pages.

---

# Lesson Runtime

The runtime is the trusted bridge between model output and persistent data.

Responsibilities:

1. Receive a lesson draft.
2. Parse structured output.
3. Validate it against the lesson schema.
4. Validate repository evidence where possible.
5. reject malformed or unsafe references.
6. persist only valid lessons.
7. assign stable identifiers and timestamps.

Model output is untrusted input.

Never persist arbitrary model-produced paths outside allowed Teach storage.

---

# Global Storage

Use an OS-appropriate application data directory.

A reasonable Linux default is:

```text
~/.local/share/teach/
```

Do not hardcode that location for every operating system if a standard application-data resolver is available.

Conceptually:

```text
<teach-data>/
├── teach.db
├── lessons/
├── assets/
└── runtime/
```

## SQLite

Use SQLite for durable metadata.

V1 SHOULD include at least:

### Project

```text
id
repository_key
name
canonical_remote nullable
first_seen_path nullable
created_at
updated_at
```

### Lesson

```text
id
slug
title
kind
subject_key nullable
project_id nullable
summary
schema_version
source_revision nullable
created_at
updated_at
```

### Lesson Revision

```text
id
lesson_id
revision_number
document_path
created_at
```

A normalized slide database is not required.

The structured lesson document may be persisted as JSON.

---

# Repository Identity

Do not identify a project solely by its current filesystem path.

For a Git repository, derive a stable repository identity from normalized repository metadata, preferably the canonical remote when one exists.

Local-only repositories need a generated durable identity/fingerprint.

Store path information only as useful metadata.

Moving a repository must not automatically create an unrelated project identity.

Do not leak credentials embedded in Git remote URLs.

Normalize/remediate remote URLs before persistence.

---

# Lesson Model

Teach models knowledge as:

```text
Library
└── Subject
    └── Lesson
        └── Section
            └── Slide
```

V1 may expose primarily lessons in the UI, but storage and schema SHOULD allow future subject/course grouping.

A lesson is not HTML.

It is a versioned structured document.

Minimum top-level shape:

```json
{
  "schemaVersion": 1,
  "title": "...",
  "kind": "general",
  "summary": "...",
  "tags": [],
  "sections": [],
  "sources": []
}
```

For project material:

```json
{
  "kind": "project",
  "project": {
    "repositoryKey": "...",
    "revision": "..."
  }
}
```

---

# Slide Types

V1 MUST implement a small reusable vocabulary rather than arbitrary component generation.

Required slide types:

```text
title
concept
code
diagram
comparison
table
callout
summary
quiz
```

Additional types may be introduced only when there is a concrete V1 need.

All slide types must have explicit schemas.

Avoid one giant slide schema containing dozens of unrelated optional properties.

Use discriminated unions.

---

# Source and Evidence Model

There are two distinct concepts.

## General sources

Used for externally researched factual material.

A source may contain:

```text
id
label
url
title nullable
retrievedAt nullable
```

## Repository evidence

Used for claims about the current project.

Example:

```json
{
  "type": "repository",
  "path": "src/components/Button.tsx",
  "startLine": 10,
  "endLine": 42,
  "revision": "e4819af..."
}
```

Project slides can reference evidence IDs.

Repository paths MUST be relative to the repository root.

Reject path traversal.

Evidence line ranges must be positive and ordered.

Where practical, validate that referenced files exist at generation time.

---

# Project Staleness

Every project lesson records the Git revision used during investigation.

When the web application can resolve the current repository state, it may later indicate stale material.

V1 only needs to preserve sufficient revision metadata.

Example future UI:

```text
Generated from e4819af
Current revision 4cc93ba
Repository has changed since this lesson was generated.
```

Do not silently claim old project material describes the latest source tree.

---

# Project-Aware Teaching Pipeline

For a project-related request:

```text
request
↓
resolve repository root
↓
capture repository identity + revision
↓
understand the user's question
↓
discover relevant files/symbols/configuration
↓
trace relationships
↓
collect evidence
↓
build a mental model
↓
design teaching progression
↓
produce structured lesson
↓
validate
↓
persist
```

Repository investigation comes BEFORE writing the lesson.

Do not start by generating generic framework explanations and then search for supporting code afterward.

---

# General Teaching Pipeline

For general knowledge:

```text
request
↓
determine learning objective
↓
infer necessary prerequisites
↓
build mental model
↓
research when current/external facts are required
↓
choose concrete examples
↓
design teaching progression
↓
produce structured lesson
↓
validate
↓
persist
```

Teach may rely on the agent's available tools for research.

Teach runtime itself does not need to implement a new web search engine.

---

# Teaching Quality Requirements

Every non-trivial lesson should establish:

1. what problem or question is being solved;
2. prerequisite context when needed;
3. a useful mental model;
4. how the mechanism actually works;
5. at least one concrete example;
6. limitations, edge cases, or common misconceptions when relevant;
7. a concise synthesis.

Project lessons should additionally establish:

1. where the implementation lives;
2. how pieces relate;
3. execution/data/control flow;
4. representative real code;
5. why the project behaves as described;
6. how a developer should reason about modifying or extending it.

Do not force identical slide counts.

Do not pad lessons simply to appear comprehensive.

---

# Code Slides

Code slides support:

```text
language
code
caption
highlights
evidenceRefs
```

For repository code, preserve the source exactly except for deliberately omitted regions.

If lines are omitted, indicate omission.

Never alter repository code merely to make it pedagogically cleaner while still labeling it as source code.

Generated pseudocode/examples must be labeled as such.

---

# Diagram Slides

V1 SHOULD support Mermaid or another deterministic text-based diagram representation.

The renderer owns diagram rendering.

Useful diagram categories include:

- architecture
- sequence
- state/flow
- dependency
- data flow

Do not generate decorative diagrams that add no explanatory value.

---

# Quiz Slides

Quiz content is for retrieval and comprehension checks, not grading users.

V1 can support:

```text
question
options nullable
answer
explanation
```

Answers may initially be revealable client-side.

No learner analytics are required in V1.

---

# Web Application

Teach Web is a persistent library, not a collection of unrelated generated HTML files.

Required V1 routes/views:

```text
/
lesson/:id
```

The home/library view MUST provide:

- lesson list
- title
- general/project distinction
- project name where applicable
- created/updated timestamp
- basic search
- recent lessons

The lesson view MUST provide:

- slide presentation
- previous/next navigation
- keyboard navigation
- slide overview or navigation rail
- fullscreen presentation mode
- code syntax highlighting
- diagrams
- evidence/source display
- link back to library

Responsive behavior should be reasonable on normal desktop screens.

The presentation should visually feel like slides, not a long Markdown article.

---

# Server Lifecycle

`/teach open` should:

1. determine whether the Teach web server is already running;
2. reuse it when healthy;
3. otherwise start it;
4. open the browser at the library.

Do not start duplicate servers unnecessarily.

Avoid fixed-port fragility.

Persist or communicate the selected local port safely.

The server MUST bind locally by default.

Do not expose the user's code-backed lessons publicly by default.

---

# `/teach` Command UX

Examples:

```text
/teach explain virtual memory
```

Expected behavior:

```text
Teaching: Virtual Memory
Investigating prerequisites...
Building lesson...
Saved: Virtual Memory
Open: <local Teach URL>
```

For project mode:

```text
/teach explain how the component system works in this project
```

Useful progress could include:

```text
Project: my-app
Revision: 1a2b3c4
Investigating component architecture...
Collected evidence from 8 files.
Building lesson...
Saved: Component Architecture
```

Progress must be concise.

Do not stream internal chain-of-thought.

---

# Error Semantics

Failures should be explicit.

Examples:

```text
Teach could not resolve a project repository required by this request.
```

```text
Lesson generation completed, but the lesson failed schema validation.
```

```text
Referenced repository evidence is no longer valid.
```

Do not save partially validated lessons as successful material.

Temporary generation artifacts may be retained only when deliberately useful for debugging and clearly separated from the library.

---

# Security

Teach handles source code and AI-generated content.

At minimum:

- render lesson text safely;
- sanitize generated markup;
- never execute arbitrary lesson HTML;
- protect against path traversal;
- avoid persisting Git credentials;
- do not expose the server externally by default;
- validate browser-facing identifiers;
- treat model output as untrusted;
- do not allow lesson content to choose arbitrary local files;
- repository investigation is read-only unless another user request explicitly authorizes modifications.

Avoid storing unnecessary copies of whole repositories.

---

# Out of Scope for V1

Do NOT implement these merely because the architecture discusses future growth:

- cloud sync
- multi-user collaboration
- accounts/authentication
- automatic semantic merging of existing lessons
- spaced repetition scheduling
- learner progress analytics
- AI chat embedded inside slides
- live editable playgrounds
- arbitrary React component execution
- automated screenshots of every UI component
- browser-based repository editor
- remote lesson publishing
- vector database
- embeddings
- background watchers
- automatic regeneration whenever Git changes

Keep extension points possible without implementing them.

---

# V1 Acceptance Criteria

V1 is complete only when all of the following work.

## Installation

The repository is a valid Pi package.

A clean install exposes Teach without manually copying individual source files.

## General lesson

From a directory outside a Git project:

```text
/teach explain dependency injection
```

creates a schema-valid general lesson in global storage and makes it visible in the Teach web library.

## Persistence

Restarting Pi does not lose the generated lesson.

Running Pi from a different directory exposes the same lesson library.

## Project lesson

Inside a fixture repository:

```text
/teach explain how authentication works in this project
```

creates a project lesson containing:

- stable project identity
- captured Git revision
- repository evidence
- real code references
- structured explanation based on the fixture

## Evidence safety

Attempts to persist evidence such as:

```text
../../etc/passwd
```

are rejected.

## Rendering

All required V1 slide types render without custom lesson-specific HTML.

## Navigation

The user can navigate slides with keyboard controls and return to the global library.

## Search

The library can find a saved lesson by title or basic searchable metadata.

## Web lifecycle

Repeated `/teach open` calls do not leave uncontrolled duplicate server processes.

## Validation

Malformed model-produced lesson data does not enter the normal lesson library.

## Verification

At minimum:

```text
typecheck
unit tests
integration tests for storage
integration tests for command/runtime
lesson-schema tests
project evidence tests
web build
```

must pass.

---

# Engineering Rules

- Use explicit types.
- Validate I/O boundaries.
- Keep filesystem effects behind interfaces.
- Keep storage behind an interface.
- Keep project inspection behind an interface.
- Keep Pi-specific APIs out of core domain modules where practical.
- Do not place teaching prompts as large inline strings throughout source files.
- Do not duplicate schema definitions between runtime and web application.
- Prefer one canonical lesson schema.
- Add migration/versioning strategy from the first persisted schema.
- Tests must use temporary application-data directories rather than the developer's real Teach library.
- Tests must never open the real browser.
- Do not introduce a dependency only to save a few lines of straightforward code.

---

# `docs/architecture.md`

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

# `docs/lesson-format.md`

# Lesson Format V1

The implementation must define the canonical schema in code and export types from it.

The following is conceptual rather than copy-paste TypeScript.

## Lesson

```text
schemaVersion: 1
title: string
kind: "general" | "project"
summary: string
tags: string[]
sections: Section[]
sources: Source[]
project?: ProjectSnapshot
```

Constraints:

- title is non-empty and bounded;
- summary is bounded;
- sections is non-empty;
- identifiers referenced inside the lesson must resolve;
- project is required exactly when kind is project.

## Section

```text
id
title
slides[]
```

## Common Slide Fields

```text
id
type
title
speakerNotes?   // optional future-friendly field; not required in UI
evidenceRefs?
sourceRefs?
```

IDs are unique within a lesson.

## Title Slide

```text
type: "title"
subtitle?
```

## Concept Slide

```text
type: "concept"
body
keyPoints?
```

## Code Slide

```text
type: "code"
language?
code
caption?
highlights?
```

## Diagram Slide

```text
type: "diagram"
format: "mermaid"
source
caption?
```

## Comparison Slide

```text
type: "comparison"
left
right
```

## Table Slide

```text
type: "table"
columns[]
rows[][]
```

## Callout Slide

```text
type: "callout"
tone: "info" | "warning" | "insight"
body
```

## Summary Slide

```text
type: "summary"
points[]
```

## Quiz Slide

```text
type: "quiz"
question
options?
answer
explanation
```

Do not allow raw script, iframe HTML, arbitrary JSX, or arbitrary CSS in lesson data.

---

# `docs/storage.md`

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

# README expectations

The final README should explain:

- what Teach is;
- installation;
- `/teach <request>`;
- `/teach open`;
- general vs project lessons;
- where data is stored;
- privacy implications of storing project code snippets;
- local-only server default;
- development commands;
- test commands;
- package structure.

Keep implementation internals in `docs/`; keep README user-oriented.
