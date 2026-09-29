// @vitest-environment jsdom
import { beforeAll, afterAll, expect, it } from 'vitest';
import mermaid from 'mermaid';
import { renderDiagramSvg } from '../web/renderers.tsx';

const source = `flowchart LR
  App[Application setup] -->|creates| Sender[SMTP sender]
  App -->|constructs with sender| Service[WelcomeService]
  Service -->|calls send at runtime| Sender`;

const originalBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
const originalTextLength = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getComputedTextLength');
const originalRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');

beforeAll(() => {
  // jsdom has no SVG layout engine; Mermaid only needs measurements to place labels.
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 160, height: 40 }),
  });
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: function (this: SVGElement) { return (this.textContent?.length ?? 0) * 8; },
  });
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 160, height: 40, top: 0, left: 0, right: 160, bottom: 40 }),
  });
});

afterAll(() => {
  for (const [prototype, name, descriptor] of [
    [SVGElement.prototype, 'getBBox', originalBBox],
    [SVGElement.prototype, 'getComputedTextLength', originalTextLength],
    [HTMLElement.prototype, 'getBoundingClientRect', originalRect],
  ] as const) {
    if (descriptor) Object.defineProperty(prototype, name, descriptor);
    else Reflect.deleteProperty(prototype, name);
  }
});

it('keeps node and edge labels after Mermaid rendering and SVG-only sanitization', async () => {
  const svg = await renderDiagramSvg(source);
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  expect(document.querySelector('parsererror')).toBeNull();
  const nodeLabels = [...document.querySelectorAll('g.node .label text')].map(node => node.textContent?.trim());
  const edgeLabels = [...document.querySelectorAll('.edgeLabel text')].map(edge => edge.textContent?.trim());
  expect(nodeLabels).toEqual(expect.arrayContaining(['Application setup', 'SMTP sender', 'WelcomeService']));
  expect(edgeLabels).toEqual(expect.arrayContaining(['creates', 'constructs with sender', 'calls send at runtime']));
  expect(document.querySelectorAll('foreignObject, script')).toHaveLength(0);
  expect(mermaid.mermaidAPI.getConfig()).toMatchObject({ htmlLabels: false, securityLevel: 'strict', theme: 'neutral' });
});
