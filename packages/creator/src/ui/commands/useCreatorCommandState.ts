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
  useEffect(() => { setSelected(0); setDismissed(undefined); }, [input, workspaceId]);
  const command = slash ? catalog.commands.find(command => command.id === parsed.id) : undefined;
  const menuKey = command?.kind === "choice" ? `choice:${command.id}` : "root";
  const optionDomId = (index: number) => `creator-command-${menuKey.replace(":", "-")}-option-${index}`;
  const copy = messages as Record<string, string>;
  const optionLabel = (commandId: string, id: string, fallback?: string) => {
    if (commandId === "enable" || commandId === "disable") {
      const pluginId = catalog.commands.flatMap(entry => entry.options).find(option => option.id === id)?.pluginId ?? id;
      return copy[`plugin_${pluginId}`] ?? fallback ?? messages.customPlugin;
    }
    return copy[`resource_${id}`] ?? fallback ?? id;
  };
  const query = parsed.kind === "command" ? parsed.args.join(" ").toLowerCase() : "";
  const filteredOptions = command?.options.filter(option => (!(["enable", "disable"].includes(command.id)) || !option.disabled) && [option.id, option.pluginId ?? "", copy[`category_${option.category}`] ?? "", optionLabel(command.id, option.pluginId ?? option.id, option.label), copy[`pluginDescription_${option.pluginId}`] ?? option.description ?? ""].some(value => value.toLowerCase().includes(query))) ?? [];
  const categoryOrder = ["conversation", "input", "response", "tools", "results", "appearance", "other"];
  if (command?.id === "enable" || command?.id === "disable") filteredOptions.sort((a, b) => categoryOrder.indexOf(a.category ?? "other") - categoryOrder.indexOf(b.category ?? "other"));
  const options = filteredOptions;
  const statusLabel = (status: string | undefined) => status === "installed" ? messages.alreadyInstalled : status === "disabled" ? messages.reenable : status === "conflict" ? messages.resourceConflict : status === "available" ? messages.available : undefined;
  const items: CreatorCommandMenuItem[] = !slash ? [] : command?.kind === "choice" ? options
    .map(option => {
      const toggle = command.id === "enable" || command.id === "disable";
      return { id: option.id, label: optionLabel(command.id, option.pluginId ?? option.id, option.label),
        ...(option.category ? { category: copy[`category_${option.category}`] ?? option.category } : {}), current: option.id === command.current,
        ...(toggle ? { description: copy[`pluginDescription_${option.pluginId}`] ?? option.description ?? messages.customPluginDescription,
          pluginId: option.pluginId ?? option.id,
          ...(option.action === "add" ? {} : { detail: option.id }),
          badgeState: option.action === "add" ? "available" as const : option.status === "installed" ? "enabled" as const : "disabled" as const,
          badge: option.action === "add" ? messages.pluginNotAdded : option.status === "installed" ? messages.pluginEnabled : messages.pluginDisabled }
          : statusLabel(option.status) ? { description: statusLabel(option.status)! } : {}),
        ...(option.disabled === undefined ? {} : { disabled: option.disabled }),
      };
    }) : catalog.commands
    .filter(entry => entry.id.startsWith(parsed.id))
    .map(entry => ({ id: entry.id, label: copy[entry.id] ?? entry.id, description: copy[`${entry.id}Description`] ?? entry.id }));
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
      event.preventDefault(); setSelected(() => {
        for (let step = 1; step <= items.length; step++) { const index = (active + (event.key === "ArrowDown" ? step : items.length - step)) % items.length; if (!items[index]?.disabled) return index; }
        return active;
      }); return { handled: true };
    }
    if (event.key === "Enter" && !event.shiftKey && items[active]) {
      event.preventDefault(); return { handled: true, ...pick(items[active]!.id) };
    }
  };
  const notice = error ?? (loading ? messages.loading : command?.kind === "choice" && !filteredOptions.length ? command.id === "enable" || command.id === "disable" ? messages.noPluginMatches : messages.noMatches : !items.length ? (parsed.kind === "command" && parsed.id ? formatLocaleMessage(messages.unknownCommand, parsed.id) : messages.unavailable) : undefined);
  return { parsed, catalog, open, items, active, menuKey, optionDomId, select: setSelected, keyDown, pick, refresh: load, show: () => setDismissed(undefined), notice, optionLabel, title: command ? copy[command.id] ?? command.id : messages.title };
}
