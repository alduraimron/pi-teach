import { randomUUID } from 'node:crypto';
import { parseLesson, type Lesson } from '../domain/lesson.ts';
import type { ProjectInspector, ProjectSnapshot } from '../project/git.ts';
import type { SavedLesson, TeachStore } from '../storage/store.ts';

export type Generation = { id: string; request: string; kind: 'general' | 'project'; project?: ProjectSnapshot };
export function classify(request: string): 'general' | 'project' {
  return /\b(this|the|current)\s+(project|repo(?:sitory)?|codebase)\b|\b(in|of|for)\s+(our|this)\s+(app|code|system|implementation)\b|\b(here|our codebase|our project|our (?:authentication|component|request|data|deployment|state) (?:flow|system|architecture|implementation))\b/i.test(request) ? 'project' : 'general';
}
export class TeachRuntime {
  private readonly store: TeachStore;
  private readonly inspector: ProjectInspector;
  constructor(store: TeachStore, inspector: ProjectInspector) { this.store = store; this.inspector = inspector; }
  begin(request: string, cwd: string): Generation {
    if (!request.trim() || request.length > 2000) throw new Error('Teach request must be 1-2000 characters');
    const kind = classify(request);
    const project = kind === 'project' ? this.inspector.resolve(cwd) : undefined;
    if (kind === 'project' && !project) throw new Error('Teach could not resolve a Git repository required by this request');
    return { id: randomUUID(), request: request.trim(), kind, ...(project ? { project } : {}) };
  }
  submit(generation: Generation, draft: unknown): SavedLesson {
    const lesson: Lesson = parseLesson(draft);
    if (lesson.kind !== generation.kind) throw new Error(`Expected ${generation.kind} lesson, got ${lesson.kind}`);
    if (lesson.kind === 'project') {
      if (!generation.project) throw new Error('Missing captured project snapshot');
      this.inspector.validate(lesson, generation.project);
    }
    return this.store.create(lesson, generation.project);
  }
}
