import type { ConversationMentionItem, ConversationMentionSource } from '@za38.03/agent-ui-plugins';
import { ConversationMentionTrigger as Implementation } from '@za38.03/agent-ui-plugins/mention-trigger';
import type { ComponentProps } from 'react';

export const source: ConversationMentionSource = {
  async search(_input): Promise<readonly ConversationMentionItem[]> {
    // 在这里调用项目的提及搜索请求，并处理鉴权和返回字段转换。
    // _input.query 是搜索词；_input.signal 用于取消请求。
    // 返回候选项数组；默认没有匹配项。
    return [];
  },
};

export function ConversationMentionTrigger(props: ComponentProps<typeof Implementation>) {
  // 在 source 中定义候选项和 data；Composer 的 requestAdapter 统一组装选中项数据。
  return <Implementation {...props} source={props.source ?? source} />;
}
