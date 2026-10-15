import { access } from "node:fs/promises";
import path from "node:path";

/** Transient Creator control marker. The generated application never consumes it. */
export const creatorCancelMarkerSchemaPattern = /^\.agentuicreator\/control\/cancel-[a-f0-9-]{36}$/;

export async function assertCreatorCommitAllowed(projectRoot: string, marker?: string): Promise<void> {
  if (marker === undefined) return;
  if (!creatorCancelMarkerSchemaPattern.test(marker)) throw new Error("Invalid Creator cancellation marker.");
  try {
    await access(path.join(projectRoot, marker));
    const error = new Error("Creator run was stopped before commit.") as Error & { code: string };
    error.code = "CREATOR_RUN_CANCELLED";
    throw error;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
