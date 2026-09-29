# Teach

Teach is a persistent learning library for [Pi](https://pi.dev). Ask a question in Pi and get a structured, navigable lesson. General lessons teach concepts; project lessons investigate the current Git repository and cite real source code. Lessons from every working directory share one local library.

## Install

Requires Node.js 24+ and Pi. Install directly from GitHub with SSH access:

```sh
pi install git:git@github.com:alduraimron/pi-teach.git
```

Pi installs the package's production dependencies and discovers both `/teach` and the bundled skill. Start Pi from any directory and run `/teach open` or `/teach <request>`. To update the Git installation later, run `pi update --extensions`.

For local development instead:

```sh
npm install
npm run build
pi install /absolute/path/to/pi-teach
```

The package declares `extensions/teach/index.ts` and `skills/teach/SKILL.md` in its Pi manifest. `web/dist/` and `dist/server.mjs` are committed so Git installs do not require a local build. The npm `prepack` script rebuilds both for a future npm publication; this package has not been published to npm. To try it without installing, use `pi -e ./extensions/teach/index.ts --skill ./skills/teach/SKILL.md` from this directory.

## Use

```text
/teach explain dependency injection
/teach explain how authentication works in this project
/teach open
```

V1 uses a conservative wording heuristic, not a separate classification model. Explicit project cues such as "in this project", "in this repository", "here", or "our authentication flow" trigger Git investigation. For example, `/teach explain how authentication works in this project` is project-specific; `/teach explain virtual memory` remains general even inside a repository. Ambiguous wording without a project cue is treated as general, so mention the project explicitly when you need a code-backed lesson. The active Pi agent reads the bundled teaching skill, investigates with read-only tools, and submits a structured lesson through a validating tool. If a project request has no committed Git HEAD, Teach reports an error rather than inventing project context. Tool or provider failures do not create a library lesson.

`/teach open` reuses or starts a local server and opens the library. The library has basic search, recent lessons, and links to slide presentations. Navigate slides with arrow keys or Space; press F for fullscreen. The navigation rail links to every slide. Each slide shows its relevant citations, and project lessons show the captured revision and dirty status.

## Data and privacy

By default, data is stored in `~/.local/share/teach/` on Linux (or `XDG_DATA_HOME/teach`), `~/Library/Application Support/Teach/` on macOS, and `%LOCALAPPDATA%/Teach/` on Windows. Override with `TEACH_DATA_DIR`. SQLite indexes metadata in `teach.db`; `lessons/<id>/<revision>.json` contains the versioned lesson documents. **Project lessons can contain source-code snippets.** Do not store secrets in lessons. The web server binds to `127.0.0.1` and rejects other Host headers; it is not a publishing service. Anyone with local access to your account can read your lessons.

## Develop

```sh
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

Tests use isolated temporary data directories and never open a real browser or call a model provider. The web build is shipped in `web/dist/` and the compiled server in `dist/server.mjs` (do not omit either from a Git package). Avoid committing `node_modules/`.

Structure: `extensions/teach/` integrates Pi; `skills/teach/` guides the agent; `src/domain/` validates the lesson; `src/project/` inspects Git; `src/lesson/` enforces generation context; `src/storage/` persists lessons; `src/server/` manages the local web server; `web/` renders slides. Details and design decisions: [architecture](docs/architecture.md), [lesson format](docs/lesson-format.md), [storage](docs/storage.md).

### Manual smoke checks

1. Outside Git, run Pi with `/teach explain dependency injection`; open the lesson URL and search for its title with `/teach open`.
2. Restart Pi from another directory and run `/teach open`; confirm the first lesson is still listed.
3. Inside a committed test Git repository with `src/auth.ts`, run `/teach explain how authentication works in this project`; inspect citations, exact code excerpt, HEAD, and dirty state.
4. For a safe automated traversal rejection check, run `npm test` (`tests/integration.test.ts` and `tests/project.test.ts`).
