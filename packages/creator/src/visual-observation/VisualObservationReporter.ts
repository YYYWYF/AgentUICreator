import { toCanvas } from "html-to-image";

import { CREATOR_VISUAL_OBSERVATION_API_PATH } from "../shared.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../workspace/types.js";

export const MAX_VISUAL_OBSERVATION_REQUEST_BYTES = 1_024 * 1_024;
const HASH = /^[a-f0-9]{64}$/;

export interface VisualObservationReporterOptions {
  endpoint?: string;
  workspaceId?: string | undefined;
  onError?: (error: unknown) => void;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function webpBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob?.type === "image/webp") resolve(blob);
      else reject(new Error("Preview WebP encoding is unavailable."));
    }, "image/webp", 0.78);
  });
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string" || !value.startsWith("data:image/webp;base64,")) {
        reject(new Error("Preview image encoding failed."));
      } else {
        resolve(value.slice("data:image/webp;base64,".length));
      }
    };
    reader.readAsDataURL(blob);
  });
}

/** Host observation; the target App only reports a published hash and Preview root. */
export function createVisualObservationReporter({
  endpoint = CREATOR_VISUAL_OBSERVATION_API_PATH,
  workspaceId,
  onError = (error) => console.warn("Visual observation unavailable", error),
}: VisualObservationReporterOptions = {}): (currentHash: string, root: HTMLElement) => void {
  let lastObservedHash: string | undefined;
  const observedHashes = new Set<string>();
  const pendingHashes = new Set<string>();
  let currentHash: string | undefined;

  return (hash, root) => {
    if (!HASH.test(hash) || !root.hasAttribute("data-agent-ui-preview-root")) return;
    currentHash = hash;
    if (hash === lastObservedHash || observedHashes.has(hash) || pendingHashes.has(hash)) return;
    lastObservedHash = hash;
    pendingHashes.add(hash);

    void (async () => {
      await nextFrame();
      await nextFrame();
      await document.fonts.ready;
      if (currentHash !== hash || !root.isConnected) {
        pendingHashes.delete(hash);
        if (lastObservedHash === hash) lastObservedHash = undefined;
        return;
      }
      pendingHashes.delete(hash);
      observedHashes.add(hash);

      const rect = root.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width < 1 || height < 1 || width > 4_096 || height > 4_096) {
        throw new Error("Preview capture dimensions are invalid.");
      }
      const captureStarted = performance.now();
      const canvas = await toCanvas(root, {
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        pixelRatio: 1,
        cacheBust: true,
        filter: (node) =>
          !(node instanceof HTMLElement && node.matches(
            '[data-slot="agent-ui-dev-studio-dock"], [data-agent-ui-preview-exclude]',
          )),
      });
      const image = await webpBlob(canvas);
      const captureDurationMs = Math.round(performance.now() - captureStarted);
      const body = JSON.stringify({
        currentHash: hash,
        capturedAt: new Date().toISOString(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
        },
        image: {
          format: "webp",
          width: canvas.width,
          height: canvas.height,
          data: await base64(image),
        },
        captureDurationMs,
        imageBytes: image.size,
        uploadStartedAt: new Date().toISOString(),
      });
      if (new TextEncoder().encode(body).byteLength > MAX_VISUAL_OBSERVATION_REQUEST_BYTES) {
        throw new Error("Preview screenshot exceeds the upload limit.");
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(workspaceId === undefined ? {} : { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId }) },
        body,
      });
      if (!response.ok) throw new Error(`Preview upload returned ${response.status}.`);
    })().catch((error) => {
      pendingHashes.delete(hash);
      try {
        onError(error);
      } catch {
        // Even an observation error handler cannot escape into Preview.
      }
    });
  };
}
