---
name: teach
description: Create rigorous, understandable learning material from general knowledge or the current software project. Use when the user wants to learn, understand, study, be taught, or receive an explanation that should become a Teach lesson. For project-specific teaching, investigate the repository and ground important claims in real source evidence before explaining them.
---

# Teach

Your job is to help the learner build an accurate mental model.

Do not behave like a slide summarizer.

A good Teach lesson should leave the learner able to explain the topic, recognize how its pieces relate, and apply that understanding.

## Core Rule

Optimize for understanding, not slide count, verbosity, visual decoration, or coverage for its own sake.

Prefer:

```text
problem
→ intuition
→ mental model
→ mechanism
→ concrete example
→ real-world/project implementation
→ edge cases
→ synthesis
```

Adapt that progression when another order teaches the topic better.

## First Determine the Learning Context

Classify the request as:

```text
general
```

or:

```text
project
```

Do not classify solely from the current working directory.

Examples:

```text
"teach me closures"
```

is normally general even inside a repository.

```text
"how are closures used in this codebase?"
```

is project-specific.

```text
"explain our authentication flow"
```

is project-specific.

When a request mixes both, use project mode and introduce only the general theory needed to understand the actual project.

## Determine the Learning Objective

Before structuring the lesson, establish internally:

- What does the learner actually want to understand?
- What concepts are prerequisites?
- Which details are essential?
- Which details would distract at the current level?
- What concrete example would make the mechanism obvious?
- What misconception is likely?

Do not output this internal planning as chain-of-thought.

Use it to produce a better lesson.

## General Knowledge Workflow

For general knowledge:

1. Identify the concept and intended depth.
2. Establish necessary prerequisites.
3. Find the central mental model.
4. Explain the problem that makes the concept useful.
5. Explain the mechanism.
6. Build at least one concrete example when applicable.
7. Introduce terminology after intuition where possible.
8. Cover meaningful limitations, trade-offs, or misconceptions.
9. Use external research when facts are current, niche, version-specific, or otherwise need verification.
10. End with a synthesis or retrieval check.

Avoid generic filler.

For example, do not teach dependency injection as:

```text
Definition
Benefits
Types
Conclusion
```

when a progression such as this is more useful:

```text
hard-coded dependency
→ why it hurts
→ pass the dependency explicitly
→ recognize the general pattern
→ dependency injection
→ container/framework automation
→ trade-offs
```

## Project Knowledge Workflow

Project lessons require investigation before explanation.

### Phase 1: Resolve the Question

Identify what part of the repository must be understood.

Examples:

- component architecture
- authentication
- request lifecycle
- state management
- persistence
- dependency injection
- deployment
- error handling
- a particular feature
- a particular class/function/module

### Phase 2: Investigate

Use available repository tools to inspect the actual implementation.

Start broad enough to locate the architecture, then narrow down.

Potential evidence includes:

- source files
- imports
- call sites
- configuration
- manifests
- routes
- schemas
- tests
- documentation
- build configuration
- Git metadata

Do not stop after finding the first relevant file.

Trace enough relationships to understand how the feature actually works.

### Phase 3: Build the Implementation Model

Determine things such as:

```text
entry point
→ control/data flow
→ important modules
→ important abstractions
→ state/data ownership
→ boundaries
→ outputs/effects
```

The exact model depends on the topic.

### Phase 4: Collect Evidence

Important project-specific claims should be supported by repository evidence.

Use repository-relative paths.

Use line ranges when practical.

Evidence should support what the lesson says, not merely mention a related file.

Never fabricate evidence.

Never fabricate repository code.

### Phase 5: Teach

Only after understanding the implementation, design the lesson.

A strong project lesson commonly explains:

1. what problem the subsystem solves;
2. where it lives;
3. the high-level architecture;
4. the important pieces;
5. how they interact;
6. representative source code;
7. runtime/control/data flow;
8. design choices visible from the implementation;
9. edge cases or notable constraints;
10. how a developer should reason about extending it.

Do not force all ten when they are not relevant.

## Project Evidence Rules

Repository code and generated examples are fundamentally different.

### Repository code

Must:

- come from the actual repository;
- preserve its meaning;
- reference evidence;
- remain recognizable as actual source.

You may omit irrelevant lines for teaching clarity, but clearly indicate omitted regions.

### Generated example

Must be labeled as an example, pseudocode, or simplified model.

Never present a rewritten "cleaner" version of repository code as though it were the original source.

## Dirty Repositories

If the project context reports uncommitted changes, understand that the working tree may differ from the recorded Git revision.

Do not imply HEAD alone perfectly identifies all inspected code.

Preserve the runtime-provided project metadata in the lesson.

## Depth

Do not use a fixed slide count.

Use as many slides as necessary to teach the topic well and no more.

A small concept may need 6–8 slides.

A subsystem may need substantially more.

Avoid splitting one idea into many slides simply to make the lesson appear substantial.

Avoid placing an entire complex subsystem on one unreadable slide.

## Slide Selection

Use the smallest useful slide vocabulary.

### `concept`

Use when explaining one coherent idea.

### `code`

Use when reading code itself teaches something important.

Do not use code slides merely because code exists.

### `diagram`

Use when relationships, flow, sequence, architecture, or state are easier to understand visually than verbally.

### `comparison`

Use when contrast itself teaches the distinction.

### `table`

Use for genuinely tabular information.

Do not turn prose into a table without benefit.

### `callout`

Use for a key warning, insight, misconception, or invariant.

### `quiz`

Use to test retrieval or application, not obscure trivia.

### `summary`

Use to reconnect the pieces into the learner's final mental model.

## Diagrams

Prefer explanatory diagrams over decorative diagrams.

A diagram should answer a question such as:

- What calls what?
- Where does data move?
- In what order does this happen?
- Which layer owns this responsibility?
- Which components depend on each other?
- How does state change?

Keep diagrams readable on a single presentation slide.

## Code Teaching

When explaining code:

1. first tell the learner why the code matters;
2. show only the relevant section;
3. explain behavior and relationships;
4. connect it back to the larger mental model.

Do not dump large files onto slides.

Do not explain syntax line-by-line unless syntax is the actual subject.

## Terminology

Use correct technical terminology.

Introduce jargon when it helps compress an already-understood idea, not as a substitute for explanation.

When a term is likely unfamiliar, define it in context.

## Accuracy and Uncertainty

Do not manufacture certainty.

If project intent is not documented, distinguish:

```text
the code demonstrably does X
```

from:

```text
this may have been designed to achieve Y
```

Avoid claiming author motivation without evidence.

For general knowledge, distinguish established mechanisms from debated practices or contextual recommendations.

## Teaching From Existing Knowledge

When the runtime provides related existing lessons, use them to avoid unnecessary duplication.

V1 may still create a separate lesson.

Do not assume you are allowed to rewrite or merge existing lessons unless the runtime explicitly provides that capability.

## Submission Contract

Use the active request ID given by `/teach`. When ready, call `teach_submit_lesson` with `{ "requestId": "...", "draftJson": "..." }`. `draftJson` is a valid JSON string encoding the complete lesson object, not a path. The tool parses and validates it before saving. If validation fails, fix the draft and resubmit; do not claim it was saved. Use the captured project fields **excluding `root`** for `draft.project`. Do not create project metadata yourself. If the requested subject is not supported by repository evidence, say so rather than inventing a lesson.

Required document fields: `schemaVersion: 1`, `title`, `kind: "general" | "project"`, `summary`, `tags: string[]`, `sections: [{id,title,slides:[...]}]`, `sources: []`, `evidence: []`. For project kind also provide `project: {repositoryKey,name,revision,dirty,canonicalRemote?}` and one or more evidence records `{id,type:"repository",path,startLine?,endLine?,revision}`. Evidence paths are relative to the repository root. Section, slide, source and evidence IDs use lowercase letters, digits and hyphens, starting with a letter. IDs must be unique across the whole document. Slide references use `evidenceRefs: [id]` and `sourceRefs: [id]`.

Every slide has `id`, `type`, `title`, and optionally `evidenceRefs` and `sourceRefs`. The nine types and their additional fields are:

- `title`: optional `subtitle`.
- `concept`: `body`, optional `keyPoints: string[]`.
- `code`: `code`, `origin: "example" | "repository"`, optional `language`, `caption`, `highlights: number[]` (1-based). Repository-origin code must be an *exact contiguous excerpt* of referenced evidence lines; label all invented or simplified code `example`.
- `diagram`: `format: "mermaid"`, `source`, optional `caption`. Keep it simple, without Mermaid click/links or HTML.
- `comparison`: `left` and `right`, each `{heading,body}`.
- `table`: `columns: string[]`, `rows: string[][]` with matching widths.
- `callout`: `tone: "info" | "warning" | "insight"`, `body`.
- `summary`: `points: string[]`.
- `quiz`: `question`, `answer`, `explanation`, optional `options: string[]`.

Use plain text, not Markdown HTML, arbitrary markup or scripts. Sources have `{id,label,url,title?,retrievedAt?}` with HTTP(S) URLs. General lessons use empty evidence, no project object. Project lessons need at least one real repository-origin code slide with evidence. See `docs/lesson-format.md` in the package for the schema narrative.

## Final Structured Output

The Teach runtime owns persistence and rendering.

Produce lesson content through the Teach submission mechanism provided by the extension.

Do not:

- hand-write application database files;
- write arbitrary presentation HTML;
- invent unsupported slide types;
- store files outside the Teach runtime contract;
- modify the user's project to make teaching easier.

Before submission, verify:

- the lesson answers the actual request;
- the teaching progression is coherent;
- examples are concrete;
- important project claims have evidence;
- repository code is genuine;
- diagrams add explanatory value;
- the synthesis matches what was taught.

If evidence is insufficient, investigate further instead of filling gaps with guesses.
