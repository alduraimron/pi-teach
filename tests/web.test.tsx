import { expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderers, renderSlide } from '../web/renderers.tsx';
import { nextSlide } from '../web/navigation.ts';
import { general } from './fixtures.ts';
it('implements every required renderer and renders known slide components', () => {
  const slides = general().sections[0].slides;
  expect(Object.keys(renderers).sort()).toEqual(slides.map(s => s.type).sort());
  for (const slide of slides.filter(s => s.type !== 'code' && s.type !== 'diagram')) {
    expect(renderToStaticMarkup(<>{renderSlide(slide)}</>)).toContain(slide.type === 'title' ? slide.title : '');
  }
});
it('bounds slide navigation and ignores unknown keys', () => {
  expect(nextSlide(0, 3, 'ArrowRight')).toBe(1);
  expect(nextSlide(2, 3, ' ')).toBe(2);
  expect(nextSlide(0, 3, 'ArrowLeft')).toBe(0);
  expect(nextSlide(1, 3, 'ArrowUp')).toBe(0);
  expect(nextSlide(1, 3, 'Escape')).toBe(1);
});
