import path from "node:path";

export const CREATOR_METADATA_DIRECTORY = ".agent-ui/creator";

export function isCreatorMetadataPath(projectRoot: string, candidate: string): boolean {
  const relative = path.relative(projectRoot, candidate).split(path.sep).join("/").toLowerCase();
  return relative === CREATOR_METADATA_DIRECTORY || relative.startsWith(`${CREATOR_METADATA_DIRECTORY}/`);
}
