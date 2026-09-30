// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { general } from './fixtures.ts';

vi.mock('react-dom/client', async importOriginal => {
  const original = await importOriginal<typeof import('react-dom/client')>();
  return { ...original, createRoot: vi.fn(original.createRoot) };
});

it('opens each slide at the top after button, keyboard and overview navigation', async () => {
  const previousPath = location.pathname;
  const id = '11111111-1111-4111-8111-111111111111';
  history.replaceState(null, '', `/lesson/${id}`);
  const container = document.createElement('div');
  container.id = 'root';
  document.body.append(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ document: general() }) }));
  try {
    await act(async () => { await import('../web/main.tsx'); });
    const stage = container.querySelector<HTMLElement>('.stage')!;
    expect(stage).not.toBeNull();

    stage.scrollTop = 800;
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Next slide"]')!.click(); });
    expect(stage.scrollTop).toBe(0);
    expect(container.querySelector('h1')!.textContent).toBe('The problem');

    stage.scrollTop = 1200;
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); });
    expect(stage.scrollTop).toBe(0);
    expect(container.querySelector('h2')!.textContent).toBe('Authentication');

    stage.scrollTop = 400;
    await act(async () => { container.querySelectorAll<HTMLButtonElement>('.rail-item')[1].click(); });
    expect(stage.scrollTop).toBe(0);
    expect(container.querySelector('h1')!.textContent).toBe('The problem');
  } finally {
    const root = vi.mocked(createRoot).mock.results[0]?.value as ReturnType<typeof createRoot> | undefined;
    if (root) await act(async () => { root.unmount(); });
    container.remove();
    history.replaceState(null, '', previousPath);
    vi.unstubAllGlobals();
  }
});
