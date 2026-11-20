import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Image } from '../src/internal/adapters-generated/assistant-ui/components/assistant-ui/elements/image.js';
import { File, getFileHref, getBase64Size } from '../src/internal/adapters-generated/assistant-ui/components/assistant-ui/elements/file.js';

const mounted: { host: HTMLDivElement; root: Root }[] = [];
async function mount(node: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ host, root });
  await act(async () => root.render(node));
  return { host, root };
}
afterEach(async () => {
  for (const { host, root } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
  vi.restoreAllMocks();
});

it('keeps zoom keyboard handling, focus restoration and scroll cleanup', async () => {
  const originalOverflow = document.body.style.overflow;
  document.body.style.overflow = 'auto';
  try {
    const { host } = await mount(<Image image='https://example.test/image.png' type='image' status={{ type: 'complete' }} />);
    const trigger = host.querySelector<HTMLDivElement>('.aui-image-zoom-trigger')!;
    trigger.focus();
    await act(async () => trigger.click());
    const dialog = document.querySelector<HTMLElement>('[data-slot="image-zoom-overlay"]')!;
    const close = dialog.querySelector<HTMLButtonElement>('button')!;
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[data-slot="image-zoom-overlay"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('auto');
  } finally {
    document.body.style.overflow = originalOverflow;
  }
});

it('preserves generating and blocked image states', async () => {
  const { host, root } = await mount(<Image image='' type='image' filename='report.png' status={{ type: 'running' }} />);
  expect(host.querySelector('[data-slot="image-generating"]')).not.toBeNull();
  expect(host.querySelector('[data-slot="image-filename"]')?.textContent).toBe('report.png');
  await act(async () => root.render(<Image image='' type='image' status={{ type: 'incomplete', reason: 'content-filter' }} />));
  expect(host.querySelector('[data-slot="image-content-filter-error"]')).not.toBeNull();
  expect(host.querySelector('.aui-image-zoom-trigger')).toBeNull();
});

it('keeps file size parsing, opaque handles and unsafe URL handling', () => {
  expect(getBase64Size('SGVsbG8=')).toBe(5);
  expect(getBase64Size('invalid!')).toBe(0);
  expect(getFileHref('opaque-file-1', 'application/pdf', 'id')).toBeNull();
  expect(getFileHref('javascript:alert(1)', 'application/pdf')).toBeNull();
  expect(getFileHref('JVBERi0=', 'application/pdf')).toBe('data:application/pdf;base64,JVBERi0=');
});

it('preserves document downloads and media controls', async () => {
  const { host } = await mount(<>
    <File type='file' filename='report.pdf' data='https://example.test/report.pdf' mimeType='application/pdf' sourceType='url' status={{ type: 'complete' }} />
    <File.Player data='https://example.test/report.webm' mimeType='video/webm' sourceType='url' controlsList='nodownload' />
  </>);
  const download = host.querySelector<HTMLAnchorElement>('[data-slot="file-download"]')!;
  expect(download.download).toBe('report.pdf');
  expect(download.href).toBe('https://example.test/report.pdf');
  expect(host.querySelector('video')?.getAttribute('controlslist')).toBe('nodownload');
  expect(host.querySelector('video')?.autoplay).toBe(false);
});
