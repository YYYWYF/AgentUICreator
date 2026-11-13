// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AssistantRobot } from '../../../plugins/resources/registry/items/foundation/shell-assistant/files/application/shell/AssistantRobot';

it('keeps a frontal still under reduced motion and cleans up visibility/animation listeners', async () => {
  const reduced = new EventTarget() as EventTarget & { matches: boolean };
  reduced.matches = true;
  let hidden = false;
  const context = { clearRect: vi.fn(), drawImage: vi.fn() };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  const visibility = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  const request = vi.fn(() => 1), cancel = vi.fn();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  const bubbles: { cancel: ReturnType<typeof vi.fn>; onfinish: null | (() => void) }[] = [];
  const animate = vi.fn(() => { const bubble = { cancel: vi.fn(), onfinish: null }; bubbles.push(bubble); return bubble; });
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  vi.stubGlobal('requestAnimationFrame', request); vi.stubGlobal('cancelAnimationFrame', cancel);
  vi.stubGlobal('CanvasRenderingContext2D', function () {});
  vi.stubGlobal('matchMedia', () => reduced);
  vi.stubGlobal('Image', class {
    onload?: () => void;
    set src(_source: string) { queueMicrotask(() => this.onload?.()); }
    decode() { return Promise.resolve(); }
  });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const props = { hovered: false, clickSignal: 0, completionSignal: 0, activity: 'idle' as const, conversationId: 'a' };
  try {
    await act(async () => { root.render(<button><AssistantRobot {...props} /></button>); });
    await vi.waitFor(() => expect(host.querySelector('canvas')?.hidden).toBe(false));
    expect(host.querySelector('button')?.dataset.robotState).toBe('still');
    expect(host.querySelector('canvas')?.dataset.view).toBe('28');
    expect(host.querySelector('svg.agent-ui-assistant-face')?.getAttribute('visibility')).toBe('visible');
    expect(host.querySelector('[data-open]')?.getAttribute('d')).toMatch(/^M.+Z$/);
    expect(host.querySelector('[data-mouth]')?.getAttribute('d')).toContain('Q');
    expect(request).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
    await act(async () => { root.render(<button><AssistantRobot {...props} hovered clickSignal={1} /></button>); });
    expect(host.querySelector('canvas')?.dataset.view).toBe('28');
    expect(request).not.toHaveBeenCalled();
    reduced.matches = false; act(() => reduced.dispatchEvent(new Event('change')));
    expect(request).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(2000); act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(host.querySelector<HTMLElement>('.agent-ui-assistant-heart-bubble')?.style.left).not.toBe('');
    hidden = true; act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(2);
    expect(bubbles[0]!.cancel).toHaveBeenCalled();
    hidden = false; act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(request).toHaveBeenCalledTimes(3);
    expect(animate).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    expect(bubbles.every(bubble => bubble.cancel.mock.calls.length > 0)).toBe(true);
    const calls = request.mock.calls.length;
    document.dispatchEvent(new Event('visibilitychange')); reduced.dispatchEvent(new Event('change'));
    expect(request).toHaveBeenCalledTimes(calls);
    expect(cancel).toHaveBeenCalled();
  } finally {
    host.remove(); getContext.mockRestore(); visibility.mockRestore(); clock.mockRestore(); vi.unstubAllGlobals();
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  }
});

it('blinks the SVG eyes continuously without switching or redrawing a stationary body view', async () => {
  const context = { clearRect: vi.fn(), drawImage: vi.fn() };
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('CanvasRenderingContext2D', function () {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }));
  vi.stubGlobal('Image', class {
    onload?: () => void;
    set src(_source: string) { queueMicrotask(() => this.onload?.()); }
    decode() { return Promise.resolve(); }
  });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => { root.render(<button><AssistantRobot hovered={false} clickSignal={0} completionSignal={0} activity='idle' conversationId='a' /></button>); });
    await vi.waitFor(() => expect(host.querySelector('canvas')?.hidden).toBe(false));
    const open = host.querySelector('[data-eye]')!.getAttribute('transform');
    expect(host.querySelector('canvas')?.dataset.view).toBe('14');
    for (let time = 16; time <= 2336; time += 16) act(() => frame?.(time));
    expect(host.querySelector('[data-eye]')?.getAttribute('transform')).not.toBe(open);
    const closed = host.querySelector('[data-eye]')!.getAttribute('transform')!;
    const matrix = closed.match(/matrix\(([^)]+)\)/)![1]!.split(' ').map(Number);
    expect(matrix[0]! * matrix[3]! - matrix[1]! * matrix[2]!).toBeCloseTo(.02, 4);
    expect(host.querySelector('canvas')?.dataset.view).toBe('14');
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    for (let time = 2352; time <= 2704; time += 16) act(() => frame?.(time));
    expect(host.querySelector('[data-eye]')?.getAttribute('transform')).toBe(open);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
  } finally {
    act(() => root.unmount()); host.remove(); getContext.mockRestore(); visibility.mockRestore(); clock.mockRestore(); vi.unstubAllGlobals();
  }
});
