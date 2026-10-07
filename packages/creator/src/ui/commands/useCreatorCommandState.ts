import { useEffect, useState, type KeyboardEvent } from "react";
import { parseCreatorCommand } from "../../commands/parser.js";
import { CREATOR_COMMANDS_API_PATH, type CreatorCommandCatalog } from "../../commands/types.js";
import { CREATOR_WORKSPACE_ID_HEADER } from "../../workspace/types.js";
import { useAgentUILocale, formatLocaleMessage } from "../i18n/locale.js";
import type { CreatorCommandMenuItem } from "./creator-command-types.js";

export function useCreatorCommandState(input: string, workspaceId: string | undefined) {
  const messages = useAgentUILocale("commands");
  const [catalog, setCatalog] = useState<CreatorCommandCatalog>({ commands: [] });
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [navigated, setNavigated] = useState(false);
  const [dismissed, setDismissed] = useState<string>();
  const parsed = parseCreatorCommand(input);
  const slash = parsed.kind === "command";
  const load = async (signal?: AbortSignal) => {
    if (!workspaceId) return;
    setLoading(true); setError(undefined);
    try {
      const response = await fetch(CREATOR_COMMANDS_API_PATH, { headers: { [CREATOR_WORKSPACE_ID_HEADER]: workspaceId }, cache: "no-store", ...(signal ? { signal } : {}) });
      if (!response.ok) throw new Error();
      const value = await response.json() as CreatorCommandCatalog;
      if (!signal?.aborted) setCatalog(value);
    } catch { if (!signal?.aborted) { setCatalog({ commands: [] }); setError(messages.unavailable); } }
    finally { if (!signal?.aborted) setLoading(false); }
  };
  useEffect(() => {
    setCatalog({ commands: [] });
    if (!slash || !workspaceId) return;
    const controller = new AbortController(); void load(controller.signal);
    return () => controller.abort();
  }, [slash, workspaceId]);
  useEffect(() => { setSelected(0); setNavigated(false); setDismissed(undefined); }, [input, workspaceId]);
  const command = slash ? catalog.commands.find(command => command.id === parsed.id) : undefined;
  const filteredOptions = command && parsed.kind === "command" ? command.options.filter(option => option.id.toLowerCase().includes(parsed.args.join(" ").toLowerCase())) : [];
  const items: CreatorCommandMenuItem[] = !slash ? [] : command ? (filteredOptions.length ? filteredOptions : command.options)
    .map(option => ({ id: option.id, label: themeLabel(option.id), current: option.id === command.current })) : catalog.commands
    .filter(command => command.id.startsWith(parsed.id))
    .map(command => ({ id: command.id, label: messages.theme, description: messages.themeDescription }));
  function themeLabel(id: string) { return ({ light: messages.light, dark: messages.dark, violet: messages.violet } as Record<string, string>)[id] ?? id; }
  const active = Math.min(selected, Math.max(0, items.length - 1));
  const open = slash && dismissed !== input;
  const pick = (id: string) => command ? { execute: `/theme ${id}` } : { input: `/${id} ` };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); setDismissed(input); return { handled: true }; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setNavigated(true); setSelected(items.length ? (active + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length : 0); return { handled: true };
    }
    if (event.key === "Enter" && !event.shiftKey && items[active]) {
      // Explicit arguments are authoritative: never silently substitute a filtered option.
      if (command && parsed.kind === "command" && parsed.args.length && !navigated) return;
      event.preventDefault(); return { handled: true, ...pick(items[active]!.id) };
    }
  };
  const notice = error ?? (loading ? messages.loading : command && !filteredOptions.length ? formatLocaleMessage(messages.unknownTheme, parsed.kind === "command" ? parsed.args.join(" ") : "") : !items.length ? (parsed.kind === "command" && parsed.id ? formatLocaleMessage(messages.unknownCommand, parsed.id) : messages.unavailable) : undefined);
  return { parsed, catalog, open, items, active, select: setSelected, keyDown, pick, themeLabel, refresh: load, show: () => setDismissed(undefined), notice, title: command ? messages.theme : messages.title };
}
