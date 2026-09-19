import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createVisualObservationReporter } from "../src/visual-observation/VisualObservationReporter.js";
import { toCanvas } from "html-to-image";

vi.mock("html-to-image", () => ({ toCanvas: vi.fn() }));

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

class PreviewRoot {
  constructor(private excluded = false) {}
  isConnected = true;
  hasAttribute(name: string) { return name === "data-agent-ui-preview-root"; }
  matches(selector: string) { return this.excluded && selector.includes("data-agent-ui-preview-exclude"); }
  getBoundingClientRect() { return { width: 900, height: 700 }; }
}

class ImageReader {
  result: string | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL() {
    this.result = "data:image/webp;base64,UklGRgQAAABXRUJQ";
    this.onload?.();
  }
}

const canvas = {
  width: 900,
  height: 700,
  toBlob(callback: (blob: Blob) => void) {
    callback(new Blob(["RIFF....WEBP"], { type: "image/webp" }));
  },
} as unknown as HTMLCanvasElement;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
  vi.stubGlobal("window", { innerWidth: 1200, innerHeight: 700, devicePixelRatio: 1 });
  vi.stubGlobal("FileReader", ImageReader);
  vi.stubGlobal("HTMLElement", PreviewRoot);
  vi.mocked(toCanvas).mockResolvedValue(canvas);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("captures one observation per hash despite rerenders", async () => {
  const upload = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", upload);
  const root = new PreviewRoot() as unknown as HTMLElement;
  const report = createVisualObservationReporter({ onError: (error) => { throw error; } });
  report(HASH_A, root);
  report(HASH_A, root);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  const body = JSON.parse(upload.mock.calls[0][1].body);
  expect(body.currentHash).toBe(HASH_A);
  expect(body.image.width).toBeGreaterThan(0);
  expect(vi.mocked(toCanvas)).toHaveBeenCalledTimes(1);
  const filter = vi.mocked(toCanvas).mock.calls[0]![1]!.filter!;
  expect(filter(new PreviewRoot(true) as unknown as HTMLElement)).toBe(false);
  expect(filter(new PreviewRoot() as unknown as HTMLElement)).toBe(true);
});

it("keeps a late A upload separate from B", async () => {
  let releaseA!: (value: HTMLCanvasElement) => void;
  vi.mocked(toCanvas)
    .mockImplementationOnce(() => new Promise((resolve) => { releaseA = resolve; }))
    .mockResolvedValueOnce(canvas);
  const upload = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", upload);
  const root = new PreviewRoot() as unknown as HTMLElement;
  const report = createVisualObservationReporter();
  report(HASH_A, root);
  await vi.waitFor(() => expect(toCanvas).toHaveBeenCalledTimes(1));
  report(HASH_B, root);
  await vi.waitFor(() => expect(toCanvas).toHaveBeenCalledTimes(2));
  releaseA(canvas);
  await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  const hashes = upload.mock.calls.map((call) => JSON.parse(call[1].body).currentHash);
  expect(hashes.sort()).toEqual([HASH_A, HASH_B]);
});

it("reports capture failure without throwing into Preview", async () => {
  vi.mocked(toCanvas).mockRejectedValueOnce(new Error("canvas failed"));
  const onError = vi.fn();
  const upload = vi.fn();
  vi.stubGlobal("fetch", upload);
  createVisualObservationReporter({ onError })(
    HASH_A, new PreviewRoot() as unknown as HTMLElement,
  );
  await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  expect(upload).not.toHaveBeenCalled();
});
