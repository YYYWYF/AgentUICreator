import type { ComposerRequestAdapter } from '@za38.03/agent-ui-plugins';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Project-owned default. Change this mapping to match the business API. */
export const requestAdapter: ComposerRequestAdapter = ({ request, pluginData, sources }) => {
  const owner = Object.keys(pluginData).find(owner => sources[owner]?.pluginId === 'skills');
  const value = record(owner === undefined ? undefined : pluginData[owner]);
  if (typeof value.id !== 'string' || !value.id.trim() || typeof value.label !== 'string' || !value.label.trim())
    return request;
  const skill = { id: value.id, label: value.label };
  const forwardedProps = record(request.forwardedProps);
  return {
    ...request,
    forwardedProps: {
      ...forwardedProps,
      ctx: { ...record(forwardedProps.ctx), skill },
    },
  };
};
