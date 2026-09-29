import React, { useEffect, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import DOMPurify from 'dompurify';
import type { Slide } from '../src/domain/lesson.ts';

for (const [name, language] of Object.entries({ typescript, ts: typescript, javascript, js: javascript, python, py: python, json, bash, css, html: xml, xml })) hljs.registerLanguage(name, language);
function Diagram({ source }: { source: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    setSvg('');
    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: false } });
      const result = await mermaid.render(`diagram-${crypto.randomUUID().replaceAll('-', '')}`, source);
      if (alive) setSvg(DOMPurify.sanitize(result.svg, { USE_PROFILES: { svg: true, svgFilters: true } }));
    }).catch(() => { if (alive) setSvg('Diagram could not be rendered.'); });
    return () => { alive = false; };
  }, [source]);
  return svg.startsWith('<svg') ? <div className="diagram" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="muted">{svg || 'Rendering diagram...'}</p>;
}
function Code({ slide }: { slide: Extract<Slide, { type: 'code' }> }) {
  const highlighted = slide.code.split('\n').map((line, i) => {
    const html = slide.language && hljs.getLanguage(slide.language) ? hljs.highlight(line, { language: slide.language }).value : hljs.highlightAuto(line, ['typescript','javascript','python','json','bash','css','html']).value;
    return <span className={`code-line ${slide.highlights?.includes(i + 1) ? 'highlight' : ''}`} key={i}><span className="line-number">{i + 1}</span><span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} /></span>;
  });
  return <><div className="code-label">{slide.origin === 'example' ? 'Illustrative example' : 'From the repository'} {slide.language ? ` / ${slide.language}` : ''}</div><pre className="code"><code>{highlighted}</code></pre>{slide.caption && <p className="caption">{slide.caption}</p>}</>;
}
export const renderers: { [K in Slide['type']]: (slide: Extract<Slide, { type: K }>) => React.ReactNode } = {
  title: slide => <div className="title-slide"><span className="eyebrow">A TEACH LESSON</span><h2>{slide.title}</h2>{slide.subtitle && <p>{slide.subtitle}</p>}</div>,
  concept: slide => <><p className="body-text">{slide.body}</p>{slide.keyPoints && <ul className="points">{slide.keyPoints.map((x, i) => <li key={i}>{x}</li>)}</ul>}</>,
  code: slide => <Code slide={slide} />,
  diagram: slide => <><Diagram source={slide.source} />{slide.caption && <p className="caption">{slide.caption}</p>}</>,
  comparison: slide => <div className="compare">{[slide.left, slide.right].map((side, i) => <div key={i}><h3>{side.heading}</h3><p>{side.body}</p></div>)}</div>,
  table: slide => <div className="table-wrap"><table><thead><tr>{slide.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead><tbody>{slide.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>,
  callout: slide => <div className={`callout ${slide.tone}`}><span className="eyebrow">{slide.tone}</span><p>{slide.body}</p></div>,
  summary: slide => <ul className="points summary">{slide.points.map((x, i) => <li key={i}>{x}</li>)}</ul>,
  quiz: slide => <Quiz question={slide.question} options={slide.options} answer={slide.answer} explanation={slide.explanation} />,
};
function Quiz({ question, options, answer, explanation }: { question: string; options?: string[]; answer: string; explanation: string }) {
  const [revealed, setRevealed] = useState(false);
  return <div className="quiz"><p className="body-text">{question}</p>{options && <ol>{options.map((x, i) => <li key={i}>{x}</li>)}</ol>}<button onClick={() => setRevealed(!revealed)}>{revealed ? 'Hide answer' : 'Reveal answer'}</button>{revealed && <div className="answer"><strong>{answer}</strong><p>{explanation}</p></div>}</div>;
}
export function renderSlide(slide: Slide): React.ReactNode {
  // The discriminated union is validated before storage and again on retrieval.
  const render = renderers[slide.type] as (slide: Slide) => React.ReactNode;
  return render(slide);
}
