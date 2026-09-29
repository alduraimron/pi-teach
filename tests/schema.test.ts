import { describe, it, expect } from 'vitest';
import { parseLesson } from '../src/domain/lesson.ts';
import { general } from './fixtures.ts';

describe('canonical lesson schema', () => {
  it('validates all nine V1 slide types', () => { const lesson = parseLesson(general()); expect(lesson.sections[0].slides.map(s => s.type)).toEqual(['title','concept','code','diagram','comparison','table','callout','summary','quiz']); });
  it('rejects unknown slides, extra UI, and malformed variants', () => {
    for (const change of [
      (s: any) => { s[0].type = 'html'; },
      (s: any) => { s[1].css = 'body {display:none}'; },
      (s: any) => { s[3].source = 'flowchart LR\n click A "javascript:alert(1)"'; },
      (s: any) => { s[5].rows = [['one']]; },
      (s: any) => { s[2].origin = 'repository'; },
      (s: any) => { s[2].highlights = [200]; },
    ]) { const doc = general(); change(doc.sections[0].slides); expect(() => parseLesson(doc)).toThrow(); }
  });
  it('rejects duplicate IDs and unresolved references', () => {
    const doc = general(); doc.sections[0].slides[1].id = 'start'; expect(() => parseLesson(doc)).toThrow(/Duplicate/);
    doc.sections[0].slides[1].id = 'idea'; doc.sections[0].slides[1].sourceRefs = ['missing']; expect(() => parseLesson(doc)).toThrow(/Unknown source/);
    doc.sections[0].slides[1].sourceRefs = undefined;
    doc.sources = [{id:'idea',label:'Clashing ID',url:'https://example.org'}];
    expect(() => parseLesson(doc)).toThrow(/Duplicate/);
  });
  it('keeps source code whitespace verbatim and rejects presentation markup', () => {
    const doc = general(); const code = doc.sections[0].slides[2]; if (code.type === 'code') code.code = '  const x = 1;\n';
    const parsed = parseLesson(doc).sections[0].slides[2]; if (parsed.type === 'code') expect(parsed.code).toBe('  const x = 1;\n');
    doc.summary = '<script>alert(1)</script>'; expect(() => parseLesson(doc)).toThrow();
  });
  it('rejects unsupported versions and unsafe source URLs', () => {
    expect(() => parseLesson({ ...general(), schemaVersion: 2 })).toThrow(/version/);
    expect(() => parseLesson({ ...general(), sources: [{ id: 'x', label: 'Evil', url: 'javascript:alert(1)' }] })).toThrow();
  });
});
