// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('top-aligns long content slides without shrinking headings or disabling scrolling', () => {
  const style = document.createElement('style');
  style.textContent = readFileSync(resolve(process.cwd(), 'web/style.css'), 'utf8');
  document.head.append(style);
  try {
    for (const type of ['concept', 'code', 'table', 'summary', 'diagram']) {
      const slide = document.createElement('article');
      slide.className = `slide slide-${type}`;
      const heading = document.createElement('div');
      heading.className = 'slide-heading';
      heading.innerHTML = '<h1>Heading stays at the visible start</h1>';
      const body = document.createElement('p');
      body.textContent = Array.from({ length: 65 }, (_, i) => `Explanation line ${i + 1}`).join('\n');
      slide.append(heading, body);
      document.body.append(slide);
      expect(getComputedStyle(slide).justifyContent).toBe('flex-start');
      expect(getComputedStyle(slide).overflow).toBe('auto');
      expect(getComputedStyle(heading).flexShrink).toBe('0');
      slide.remove();
    }
    const title = document.createElement('article');
    title.className = 'slide slide-title';
    const content = document.createElement('div');
    content.className = 'title-slide';
    title.append(content);
    document.body.append(title);
    expect(getComputedStyle(title).justifyContent).toBe('safe center');
    expect(getComputedStyle(content).flexShrink).toBe('0');
    title.remove();
  } finally {
    style.remove();
  }
});
