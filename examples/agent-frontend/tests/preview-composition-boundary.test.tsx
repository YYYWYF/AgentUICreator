import { useEffect } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewCompositionBoundary } from "../src/PreviewCompositionBoundary";

function BrokenPreview(): never {
  throw new Error("candidate runtime failed");
}

describe("PreviewCompositionBoundary", () => {
  let renderer: ReactTestRenderer | undefined;
  let controlPlaneUnmounts = 0;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    renderer = undefined;
    controlPlaneUnmounts = 0;
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    consoleError.mockRestore();
  });

  function CreatorControlPlane() {
    useEffect(() => () => {
      controlPlaneUnmounts += 1;
    }, []);
    return <div>Creator stream connected</div>;
  }

  it("keeps the control plane mounted while Preview fails and recovers", async () => {
    await act(async () => {
      renderer = create(
        <>
          <CreatorControlPlane />
          <PreviewCompositionBoundary revision="revision-1">
            <BrokenPreview />
          </PreviewCompositionBoundary>
        </>,
      );
    });

    expect(controlPlaneUnmounts).toBe(0);
    expect(renderer?.root.findByProps({ role: "alert" })).toBeDefined();

    await act(async () => {
      renderer?.update(
        <>
          <CreatorControlPlane />
          <PreviewCompositionBoundary revision="revision-2">
            <div>Published preview recovered</div>
          </PreviewCompositionBoundary>
        </>,
      );
    });

    expect(controlPlaneUnmounts).toBe(0);
    expect(renderer?.root.findByProps({ children: "Published preview recovered" }))
      .toBeDefined();
  });
});
