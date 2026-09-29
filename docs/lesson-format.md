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
evidence: RepositoryEvidence[]
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
// speakerNotes reserved for a future schema version; not accepted in V1
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
origin: "example" | "repository"
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

## Implemented contract

`src/domain/lesson.ts` is the sole canonical Zod schema, shared by runtime and frontend types. Parsing rejects unknown properties and unknown slide types. Every section, slide, source and evidence ID must be unique across the entire lesson, and all references must resolve. General lessons have `evidence: []` and no project. Project lessons require `project` and at least one evidence item plus a repository-origin code slide with evidence.

V1 adds a mandatory `origin: "example" | "repository"` to code slides. `repository` means the snippet is a verbatim, contiguous excerpt of the referenced file (optionally within the cited 1-based inclusive line range). Deliberate omissions cannot be represented as original source in V1; show the omitted region in another slide or label a simplified rendition `example`. The code field is not trimmed. HTML/JavaScript/CSS may be taught **as escaped code text**, not supplied as executable UI or presentation markup. Plain prose rejects HTML tags and script URLs. Mermaid link/click/HTML directives are rejected; rendered SVG is sanitized.

Repository evidence is `{id,type:"repository",path,startLine?,endLine?,revision}`. If a line range is supplied, both positive line numbers are required and `startLine <= endLine`. Evidence paths must be normalized relative paths, point to regular files inside the Git root (including symlink resolution), and reference the captured revision. `project` is `{repositoryKey,name,revision,dirty,canonicalRemote?}`; the local Git root is kept in generation context only, not in lesson JSON. `sources` are `{id,label,url,title?,retrievedAt?}`; URLs must be credential-free HTTP(S). The parser rejects any version other than 1; new versions require an explicit migration rather than reinterpretation.
