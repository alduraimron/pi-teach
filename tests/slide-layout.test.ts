// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

let style: HTMLStyleElement;
beforeEach(() => {
  style = document.createElement('style');
  style.textContent = readFileSync(resolve(process.cwd(), 'web/style.css'), 'utf8');
  document.head.append(style);
  document.body.innerHTML = `<div class="presentation"><header class="topbar">Teach</header><div class="workspace">
    <main class="stage"><div class="stage-meta">Section / slide number</div>
      <aside class="references">Sources and repository evidence</aside><footer class="controls">Navigation</footer>
    </main></div></div>`;
});
afterEach(() => {
  document.body.replaceChildren();
  style.remove();
});

function appendSlide(type: string): HTMLElement {
  const slide = document.createElement('article');
  slide.className = `slide slide-${type}`;
  document.querySelector('.stage-meta')!.after(slide);
  return slide;
}

// jsdom does not measure layout. These assertions guard the CSS rules that keep
// natural-height slide content inside a single vertical scroll owner.
it('lets the stage scroll without shrinking the header, metadata, references or controls', () => {
  const stage = document.querySelector('.stage')!;
  expect(getComputedStyle(stage).overflow).toBe('auto');
  expect(getComputedStyle(stage).minHeight).toBe('0px');
  for (const selector of ['.topbar', '.stage-meta', '.references', '.controls']) {
    expect(getComputedStyle(document.querySelector(selector)!).flexShrink).toBe('0');
  }
});

it('top-aligns content slides at natural height without nested slide scrolling', () => {
  for (const type of ['concept', 'code', 'table', 'summary', 'diagram', 'comparison', 'callout', 'quiz']) {
    const slide = appendSlide(type);
    const heading = document.createElement('div');
    heading.className = 'slide-heading';
    heading.innerHTML = '<h1>Heading stays at the real beginning</h1>';
    const body = document.createElement('p');
    body.textContent = Array.from({ length: 65 }, (_, i) => `Explanation line ${i + 1}`).join('\n');
    const caption = document.createElement('p');
    caption.className = 'caption';
    caption.textContent = 'Caption stays after the complete content';
    slide.append(heading, body, caption);
    const layout = getComputedStyle(slide);
    expect(layout.justifyContent).toBe('flex-start');
    expect(layout.flexGrow).toBe('1');
    expect(layout.flexShrink).toBe('0');
    expect(layout.flexBasis).toBe('auto');
    expect(['', 'none']).toContain(layout.maxHeight);
    expect(layout.overflow).toBe('visible');
    for (const child of slide.children) expect(getComputedStyle(child).flexShrink).toBe('0');
    slide.remove();
  }
});

it('keeps tall diagrams unshrunk and top-aligned rather than centering SVG overflow above the scroll origin', () => {
  const slide = appendSlide('diagram');
  slide.innerHTML = `<div class="slide-heading"><h1>Tall diagram</h1></div><div class="diagram">
    <svg xmlns="http://www.w3.org/2000/svg" width="280" height="2200" viewBox="0 0 280 2200"></svg>
    </div><p class="caption">The real bottom of the diagram</p>`;
  const diagram = slide.querySelector('.diagram')!;
  const svg = diagram.querySelector('svg')!;
  expect(getComputedStyle(diagram).flexShrink).toBe('0');
  expect(getComputedStyle(diagram).overflow).toBe('visible');
  expect(getComputedStyle(diagram).placeItems).toBe('start center');
  expect(getComputedStyle(svg).maxWidth).toBe('100%');
  expect(getComputedStyle(svg).height).toBe('auto');
});

it('preserves safe title centering without clipping oversized title content', () => {
  const title = appendSlide('title');
  title.innerHTML = '<div class="title-slide"><h2>Title</h2><p>Subtitle</p></div>';
  expect(getComputedStyle(title).justifyContent).toBe('safe center');
  expect(getComputedStyle(title).flexShrink).toBe('0');
  expect(getComputedStyle(title).overflow).toBe('visible');
  expect(getComputedStyle(title.querySelector('.title-slide')!).flexShrink).toBe('0');
});
