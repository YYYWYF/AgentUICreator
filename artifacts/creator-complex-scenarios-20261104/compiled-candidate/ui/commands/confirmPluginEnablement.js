import { formatLocaleMessage } from "../i18n/locale.js";
/** Confirmation only resumes the exact Host-held preparation, never a bare approval flag. */
export async function confirmPluginEnablement(request, result, messages, pluginLabel, confirm, execute) {
    if (result.status !== "confirmation-required")
        return result;
    if (request.id !== "enable" || !result.preparation)
        throw new Error("PLUGIN_ENABLEMENT_PREPARATION_INVALID");
    const preparation = result.preparation;
    const details = [
        preparation.files.length ? formatLocaleMessage(messages.preparationFiles, preparation.files.join("\n")) : "",
        preparation.packages.length ? formatLocaleMessage(messages.preparationPackages, preparation.packages.map(item => `${item.name} (${item.required})`).join("\n")) : "",
    ].filter(Boolean).join("\n\n");
    if (!confirm(formatLocaleMessage(messages.preparationConfirm, pluginLabel(preparation.pluginId), details)))
        return undefined;
    return execute({ ...request, args: { ...request.args, preparationId: preparation.id } });
}
//# sourceMappingURL=confirmPluginEnablement.js.map