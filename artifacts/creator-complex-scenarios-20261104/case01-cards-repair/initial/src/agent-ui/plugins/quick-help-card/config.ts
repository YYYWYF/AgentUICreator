/**
 * Per-card copy for the quick help cards.
 *
 * AppUIModel holds layout and composition only, so one card Plugin identity
 * cannot receive a different title per instance through props. Cards are told
 * apart by their composition instance id — the same id that keys their
 * expansion state. Add an entry here when another card is composed.
 */
const defaultTitle: Record<string, string> = {
  "zh-CN": "使用说明",
  "en-US": "Usage guide",
};

const titleByCardInstanceId: Record<string, Record<string, string>> = {
  p24: { "zh-CN": "使用说明", "en-US": "Usage guide" },
  p26: { "zh-CN": "常见问题", "en-US": "Common questions" },
};

export function getQuickHelpCardTitle(
  cardId: string | null,
  localeCode: string,
): string {
  const titles = (cardId ? titleByCardInstanceId[cardId] : undefined) ?? defaultTitle;
  return titles[localeCode] ?? titles["zh-CN"]!;
}
