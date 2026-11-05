/** Navigation vocabulary, not implementation ownership or mutation authority.
 * Apply these names only to identities present in the inspected project. */
const featureNames: Record<string, readonly string[]> = {
  "conversation-thread-list": ["聊天历史", "会话历史", "历史会话", "聊天记录", "chat history", "conversation history"],
  "dictation-action": ["语音输入", "听写", "voice input", "dictation"],
  "add-attachment-action": ["附件", "上传文件", "选文件", "attachment", "file picker"],
  "copy-action": ["复制", "copy"],
  "reload-action": ["重新生成", "重试回复", "regenerate", "retry response"],
  "feedback-actions": ["评价", "点赞", "点踩", "feedback"],
  "export-markdown-action": ["导出", "export"],
  "conversation-suggestions": ["推荐问题", "开场建议", "建议问题", "suggestions"],
  "conversation-new": ["新建会话", "新建对话", "新对话", "new chat", "new conversation"],
  "locale-switch": ["语言切换", "切换语言", "界面语言", "中英文切换", "中英切换", "切换中英文", "中文英文切换", "中文和英文之间切换", "language switch"],
  "composer": ["输入框", "消息输入", "composer", "message input"],
};

export function pluginTargetNames(plugin: { pluginId: string; name?: string; targetNames?: readonly string[] }) {
  return [...new Set([plugin.pluginId, ...(plugin.name && plugin.name.length >= 4 ? [plugin.name] : []),
    ...(plugin.targetNames ?? []), ...(featureNames[plugin.pluginId] ?? [])])];
}

/** Do not let one shared word such as history override a different feature.
 * Unrecognized natural descriptions remain available for user clarification. */
export function namesRequestedPlugins(request: string, plugins: readonly { pluginId: string; name?: string; targetNames?: readonly string[] }[], history: readonly { user: string; assistant?: string }[] = []) {
  if (!plugins.length) return false;
  const clauses = request.toLowerCase().split(/[，。；;\n]/u)
    .map(clause => clause.replace(/(?:保留|保持).{0,8}(?:源码|代码|源文件)|(?:源码|代码|源文件).{0,8}(?:保留|保持)/gu, ""))
    .filter(clause => !/(?:保留|保持|别动|不要改|不修改|(?:不要|别|不)(?:隐藏|停用|删除|移除|去掉)|\bkeep\b|\bpreserve\b|don't change|do not change)/iu.test(clause));
  const contains = (text: string, name: string) => {
    name = name.toLowerCase();
    for (let index = text.indexOf(name); index >= 0; index = text.indexOf(name, index + 1)) {
      if (!/^[a-z]/u.test(name) || (!/[a-z0-9_-]/u.test(text[index - 1] ?? "") && !/[a-z0-9_-]/u.test(text[index + name.length] ?? ""))) return true;
    }
    return false;
  };
  const names = plugins.map(pluginTargetNames);
  if (names.every(aliases => aliases.some(alias => clauses.some(clause => contains(clause, alias))))) return true;
  // A bare reference can reuse a bounded, explicit previous subject. A phrase
  // containing a new feature (e.g. an adjective before history) cannot.
  const bareReference = /^(?:请|帮我)?(?:这个|那个|刚才(?:这个|那个)?|刚才的|它)(?:插件|功能|按钮)?(?:我)?(?:不想要了|不需要了|不要了|隐藏|停用|关掉)[。！!\s]*$/u.test(request.trim());
  return bareReference && names.every(aliases => history.slice(-2).some(turn => aliases.some(alias => contains(`${turn.user}\n${turn.assistant ?? ""}`.toLowerCase(), alias))));
}
