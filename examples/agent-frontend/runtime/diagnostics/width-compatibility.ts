export type PluginWidthRequirement = "narrow" | "wide";

export type RuntimeWidthClass = "unknown" | PluginWidthRequirement;

export const WIDE_WIDTH_THRESHOLD = 480;

export function classifyContainerWidth(width: number): PluginWidthRequirement {
  return width < WIDE_WIDTH_THRESHOLD ? "narrow" : "wide";
}

export function isPluginWidthCompatible(
  requiredWidth: PluginWidthRequirement | undefined,
  actualWidthClass: RuntimeWidthClass,
): boolean {
  return !(requiredWidth === "wide" && actualWidthClass === "narrow");
}
