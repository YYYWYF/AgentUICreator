/**
 * 历史接口与 Agent 后端同域，因此使用相对地址：请求经 Agent 后端传送器发出，
 * 不单独配置域名。若业务历史接口的前缀不同，只改这一个常量。
 */
export const DEFAULT_CONVERSATION_DATA_ENDPOINT = '/api';

export interface ResolveConversationDataEndpointOptions {
  configuredEndpoint?: string | undefined;
  defaultEndpoint?: string | undefined;
}

export function resolveConversationDataEndpoint({
  configuredEndpoint,
  defaultEndpoint = DEFAULT_CONVERSATION_DATA_ENDPOINT,
}: ResolveConversationDataEndpointOptions): string {
  // 显式配置优先；否则回落到与 Agent 后端同域的默认前缀。
  const endpoint =
    configuredEndpoint?.trim() || defaultEndpoint.trim() || DEFAULT_CONVERSATION_DATA_ENDPOINT;
  return endpoint.replace(/\/+$/, '');
}
