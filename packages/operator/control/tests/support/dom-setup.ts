(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof HTMLElement !== "undefined" && !HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function (optionsOrX: ScrollToOptions | number, y?: number) {
    if (typeof optionsOrX === "number") { this.scrollLeft = optionsOrX; this.scrollTop = y ?? 0; }
    else { this.scrollTop = optionsOrX.top ?? this.scrollTop; this.scrollLeft = optionsOrX.left ?? this.scrollLeft; }
  };
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}

// Deterministic frame clock for both React test renderers and DOM integration tests.
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
globalThis.requestAnimationFrame = callback => {
  const id = ++nextFrame;
  frames.set(id, callback);
  queueMicrotask(() => { if (frames.delete(id)) callback(performance.now()); });
  return id;
};
globalThis.cancelAnimationFrame = id => { frames.delete(id); };
