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
  const copy = messages as Record<string, string>;
  const optionLabel = (commandId: string, id: string, fallback?: string) => commandId === "theme" ? themeLabel(id) : copy[`resource_${id}`] ?? fallback ?? id;
  const query = parsed.kind === "command" ? parsed.args.join(" ").toLowerCase() : "";
  const filteredOptions = command?.options.filter(option => [option.id, optionLabel(command.id, option.id, option.label), option.description ?? ""].some(value => value.toLowerCase().includes(query))) ?? [];
  const options = command?.id === "theme" && !filteredOptions.length ? command.options : filteredOptions;
  const statusLabel = (status: string | undefined) => status === "installed" ? messages.alreadyInstalled : status === "disabled" ? messages.reenable : status === "conflict" ? messages.resourceConflict : status === "available" ? messages.available : undefined;
  const items: CreatorCommandMenuItem[] = !slash ? [] : command?.kind === "choice" ? options
    .map(option => ({ id: option.id, label: optionLabel(command.id, option.id, option.label), current: option.id === command.current,
      ...(option.disabled === undefined ? {} : { disabled: option.disabled }), ...(statusLabel(option.status) ? { description: statusLabel(option.status)! } : {}) })) : catalog.commands
    .filter(entry => entry.id.startsWith(parsed.id))
    .map(entry => ({ id: entry.id, label: copy[entry.id] ?? entry.id, description: copy[`${entry.id}Description`] ?? entry.id }));
  function themeLabel(id: string) { return ({ light: messages.light, dark: messages.dark, violet: messages.violet } as Record<string, string>)[id] ?? id; }
  const active = Math.min(selected, Math.max(0, items.length - 1));
  const open = slash && dismissed !== input;
  const pick = (id: string) => {
    const item = items.find(item => item.id === id);
    // Ignore stale clicks from a previous menu instead of treating command ids as arguments.
    if (!item || item.disabled) return { handled: true };
    if (command?.kind === "choice") return { execute: `/${command.id} ${id}` };
    return catalog.commands.find(entry => entry.id === id)?.kind === "action" ? { execute: `/${id}` } : { input: `/${id} ` };
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") { event.preventDefault(); setDismissed(input); return { handled: true }; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setNavigated(true); setSelected(() => {
        for (let step = 1; step <= items.length; step++) { const index = (active + (event.key === "ArrowDown" ? step : items.length - step)) % items.length; if (!items[index]?.disabled) return index; }
        return active;
      }); return { handled: true };
    }
    if (event.key === "Enter" && !event.shiftKey && items[active]) {
      // Explicit arguments are authoritative: never silently substitute a filtered option.
      if (command?.id === "theme" && parsed.kind === "command" && parsed.args.length && !navigated) return;
      event.preventDefault(); return { handled: true, ...pick(items[active]!.id) };
    }
  };
  const notice = error ?? (loading ? messages.loading : command?.kind === "choice" && !filteredOptions.length ? command.id === "theme" ? formatLocaleMessage(messages.unknownTheme, query) : messages.noMatches : !items.length ? (parsed.kind === "command" && parsed.id ? formatLocaleMessage(messages.unknownCommand, parsed.id) : messages.unavailable) : undefined);
  return { parsed, catalog, open, items, active, select: setSelected, keyDown, pick, themeLabel, refresh: load, show: () => setDismissed(undefined), notice, optionLabel, title: command ? copy[command.id] ?? command.id : messages.title };
}
