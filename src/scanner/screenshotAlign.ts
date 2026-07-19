import type { Page } from 'playwright';
import type { ScannedElement } from '../types';

/** Ширина/высота PNG из IHDR (без доп. зависимостей). */
export function pngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
    return { width: 0, height: 0 };
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getScroll(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
}

async function setScroll(page: Page, pos: { x: number; y: number }): Promise<void> {
  await page.evaluate(({ x, y }) => {
    window.scrollTo(x, y);
  }, pos);
}

/** Скролл в (0,0) — для замера sticky/fixed в координатах fullPage-скрина. */
export async function scrollPageToTop(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    if (document.body) {
      document.body.scrollTop = 0;
    }
  });
  await delay(150);
}

/**
 * Перечитывает bbox по data-vp-id.
 * - обычные элементы: document = rect + scroll (в любой момент)
 * - fixed/sticky: только при scroll=0, иначе «залипшая» позиция даёт сдвиг на строку/хедер
 */
export async function remasureBboxesFromDom(
  page: Page,
  elements: ScannedElement[]
): Promise<void> {
  if (elements.length === 0) {
    return;
  }

  const boxes = await page.evaluate(() => {
    window.scrollTo(0, 0);
    const map: Record<string, { x: number; y: number; width: number; height: number }> = {};
    const nodes = Array.from(document.querySelectorAll('[data-vp-id]'));
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i] as HTMLElement;
      const id = node.getAttribute('data-vp-id');
      if (!id) {
        continue;
      }
      const r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        continue;
      }
      map[id] = {
        x: Math.round(r.left + window.scrollX),
        y: Math.round(r.top + window.scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    }
    return map;
  });

  for (const el of elements) {
    if (el.inIframe) {
      continue;
    }
    const next = boxes[el.id];
    if (next) {
      el.bbox = next;
    }
  }
}

/**
 * fullPage PNG + bbox в CSS px (scale:'css').
 * Без эвристического rescale по высоте PNG — он давал сдвиг на 1 строку списка.
 * Скролл пользователя восстанавливается.
 */
export async function screenshotFullPageAligned(
  page: Page,
  elements: ScannedElement[]
): Promise<Buffer> {
  const savedScroll = await getScroll(page);
  try {
    await scrollPageToTop(page);
    await remasureBboxesFromDom(page, elements);

    return await page.screenshot({
      fullPage: true,
      type: 'png',
      scale: 'css',
      animations: 'disabled',
    });
  } finally {
    await setScroll(page, savedScroll).catch(() => undefined);
  }
}
