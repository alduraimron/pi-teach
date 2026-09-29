import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderSlide } from './renderers.tsx';
import { nextSlide } from './navigation.ts';
import type { Lesson, Slide } from '../src/domain/lesson.ts';
import type { LessonListItem, SavedLesson } from '../src/storage/store.ts';
import './style.css';

function Library() {
  const [query, setQuery] = useState('');
  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/lessons?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Could not load library'); return r.json() as Promise<LessonListItem[]>; }).then(setLessons).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    }, 120);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <div className="library-shell"><header className="topbar"><a className="brand" href="/">✳ <span>teach</span></a><span className="top-label">YOUR LEARNING LIBRARY</span></header>
    <main className="library"><div className="hero"><span className="eyebrow">LEARN WITH INTENTION</span><h1>Everything you've learned,<br/><em>in one place.</em></h1><p>Lessons built for understanding. Return to a concept, revisit real code, and keep connecting the dots.</p></div>
      <div className="library-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>{query ? 'Search results' : 'Recent lessons'}</h2></div><label className="search"><span aria-hidden="true">⌕</span><input aria-label="Search lessons" placeholder="Search lessons or projects" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      {error && <p role="alert">{error}</p>}
      <div className="lesson-grid">{lessons.map((lesson, index) => <a className="lesson-card" href={`/lesson/${lesson.id}`} key={lesson.id}><div className="card-top"><span className={`badge ${lesson.kind}`}>{lesson.kind === 'general' ? 'CONCEPT' : 'PROJECT'}</span><span className="card-index">{String(index + 1).padStart(2, '0')}</span></div><h3>{lesson.title}</h3><p>{lesson.summary}</p><div className="card-foot"><span>{lesson.projectName ?? (lesson.tags.slice(0, 2).join(' · ') || 'General knowledge')}</span><span className="card-dates"><time dateTime={lesson.createdAt}>Created {new Date(lesson.createdAt).toLocaleDateString()}</time><time dateTime={lesson.updatedAt}>Updated {new Date(lesson.updatedAt).toLocaleDateString()}</time></span></div></a>)}</div>
      {!lessons.length && !error && <div className="empty"><h3>{query ? 'No matching lessons' : 'Your library starts here'}</h3><p>{query ? 'Try another topic or project name.' : 'In Pi, run /teach explain dependency injection to create your first lesson.'}</p></div>}
    </main></div>;
}
function LessonView({ id }: { id: string }) {
  const [saved, setSaved] = useState<SavedLesson>();
  const [error, setError] = useState('');
  const [at, setAt] = useState(0);
  const [overview, setOverview] = useState(false);
  useEffect(() => { fetch(`/api/lessons/${encodeURIComponent(id)}`).then(r => { if (!r.ok) throw new Error('Lesson not found'); return r.json() as Promise<SavedLesson>; }).then(setSaved).catch(e => setError(String(e))); }, [id]);
  const slides = saved?.document.sections.flatMap(section => section.slides.map(slide => ({ slide, section: section.title }))) ?? [];
  const current = slides[at];
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.altKey || event.ctrlKey || event.metaKey) return;
      if (['ArrowRight','ArrowDown','ArrowLeft','ArrowUp',' '].includes(event.key)) { event.preventDefault(); setAt(n => nextSlide(n, slides.length, event.key)); }
      if (event.key.toLowerCase() === 'f') void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
      if (event.key === 'Escape') setOverview(false);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [slides.length]);
  if (error) return <div className="empty"><a href="/">← Library</a><h2>{error}</h2></div>;
  if (!saved || !current) return <div className="empty">Loading lesson...</div>;
  const lesson: Lesson = saved.document;
  const slide: Slide = current.slide;
  const evidence = slide.evidenceRefs?.map(ref => lesson.evidence.find(x => x.id === ref)).filter(x => x !== undefined) ?? [];
  const sources = slide.sourceRefs?.map(ref => lesson.sources.find(x => x.id === ref)).filter(x => x !== undefined) ?? [];
  return <div className="presentation"><header className="topbar"><a className="brand" href="/">✳ <span>teach</span></a><div className="lesson-header"><span className={`badge ${lesson.kind}`}>{lesson.kind}</span><span>{lesson.title}</span></div><button className="icon-button" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())} title="Toggle fullscreen (F)" aria-label="Toggle fullscreen">⛶</button></header>
    <div className="workspace"><nav className={`rail ${overview ? 'expanded' : ''}`} aria-label="Slide overview"><div className="rail-heading">CONTENTS <button className="mobile-toggle" onClick={() => setOverview(!overview)}>{overview ? 'Close' : 'Open'}</button></div>{slides.map(({slide: s, section}, n) => <button key={s.id} className={`rail-item ${n === at ? 'active' : ''}`} onClick={() => { setAt(n); setOverview(false); }} aria-current={n === at ? 'step' : undefined}><span className="rail-number">{String(n + 1).padStart(2, '0')}</span><span><small>{section}</small>{s.title}</span></button>)}</nav>
      <main className="stage"><div className="stage-meta"><span>{current.section.toUpperCase()}</span><span>{String(at + 1).padStart(2,'0')} / {String(slides.length).padStart(2,'0')}</span></div><article className={`slide slide-${slide.type}`}>{slide.type !== 'title' && <div className="slide-heading"><span className="eyebrow">{slide.type.toUpperCase()}</span><h1>{slide.title}</h1></div>}{renderSlide(slide)}</article>
        {(evidence.length > 0 || sources.length > 0 || lesson.kind === 'project') && <aside className="references"><span className="eyebrow">SOURCES & CONTEXT</span>{lesson.kind === 'project' && <p>Generated from {lesson.project.name} at <code>{lesson.project.revision.slice(0, 12)}</code>{lesson.project.dirty ? ' · Uncommitted changes present' : ''}</p>}{evidence.map(e => <p key={e.id}>⌁ <code>{e.path}{e.startLine ? `:${e.startLine}-${e.endLine}` : ''}</code> <span className="muted">@ {e.revision.slice(0, 8)}</span></p>)}{sources.map(s => <p key={s.id}>↗ <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a></p>)}</aside>}
        <footer className="controls"><a href="/">← Library</a><div className="progress"><div style={{ width: `${(at + 1) / slides.length * 100}%` }} /></div><div className="buttons"><button disabled={at === 0} onClick={() => setAt(at - 1)} aria-label="Previous slide">←</button><button disabled={at === slides.length - 1} onClick={() => setAt(at + 1)} aria-label="Next slide">→</button></div></footer>
      </main></div></div>;
}
const match = location.pathname.match(/^\/lesson\/([0-9a-f-]{36})$/);
createRoot(document.getElementById('root')!).render(match ? <LessonView id={match[1]} /> : <Library />);
