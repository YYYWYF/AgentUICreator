import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { HttpAgent, MessageSchema, type Message } from "@ag-ui/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import "./creator-workbench.css";

import type {
  CreatorFileChangeReceipt,
  CreatorRunReceipt,
  CreatorValidationReceipt,
} from "../receiptTypes.js";
import { CREATOR_API_PATH } from "../shared.js";

const STORAGE_KEY = "agent-ui-creator-conversation";
const CREATOR_PANEL_MIN_WIDTH = 280;
const CREATOR_PANEL_MAX_WIDTH = 720;
const CREATOR_PREVIEW_MIN_WIDTH = 320;
const CREATOR_PANEL_KEYBOARD_STEP = 16;

function clampCreatorPanelWidth(width: number): number {
  const availableWidth = Math.max(
    CREATOR_PANEL_MIN_WIDTH,
    window.innerWidth - CREATOR_PREVIEW_MIN_WIDTH,
  );
  return Math.min(
    Math.max(width, CREATOR_PANEL_MIN_WIDTH),
    Math.min(CREATOR_PANEL_MAX_WIDTH, availableWidth),
  );
}

interface CreatorWorkbenchProps {
  children: ReactNode;
}

interface CreatorMessage {
  kind: "message";
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
  receipt?: CreatorRunReceipt | undefined;
  streaming?: boolean | undefined;
}

interface CreatorToolActivity {
  kind: "tool";
  id: string;
  name: string;
  arguments: string;
  result?: string | undefined;
  error?: string | undefined;
  status: "preparing" | "running" | "completed" | "failed";
}

type CreatorConversationItem = CreatorMessage | CreatorToolActivity;

interface StoredCreatorConversation {
  threadId: string;
  items: CreatorConversationItem[];
  agentMessages: Message[];
}

const roleLabels: Record<CreatorMessage["role"], string> = {
  user: "用户",
  assistant: "Creator",
  error: "错误",
};

const fileStatusLabels: Record<CreatorFileChangeReceipt["status"], string> = {
  created: "已创建",
  modified: "已修改",
};

const validationStatusLabels: Record<
  CreatorValidationReceipt["status"],
  string
> = {
  passed: "通过",
  failed: "失败",
};

const toolStatusLabels: Record<CreatorToolActivity["status"], string> = {
  preparing: "正在准备",
  running: "正在执行",
  completed: "已完成",
  failed: "执行失败",
};

const markdownPlugins = [remarkGfm];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreatorRunReceipt(value: unknown): value is CreatorRunReceipt {
  if (
    !isRecord(value) ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.validations)
  ) {
    return false;
  }

  return (
    value.files.every(
      (file) =>
        isRecord(file) &&
        typeof file.path === "string" &&
        (file.status === "created" || file.status === "modified") &&
        typeof file.diff === "string" &&
        typeof file.truncated === "boolean",
    ) &&
    value.validations.every(
      (validation) =>
        isRecord(validation) &&
        typeof validation.command === "string" &&
        (validation.status === "passed" || validation.status === "failed") &&
        (typeof validation.exitCode === "number" ||
          validation.exitCode === null) &&
        typeof validation.output === "string" &&
        typeof validation.truncated === "boolean",
    )
  );
}

function receiptFromRunResult(value: unknown): CreatorRunReceipt | undefined {
  if (!isRecord(value) || value.receipt === undefined) {
    return undefined;
  }
  if (!isCreatorRunReceipt(value.receipt)) {
    throw new Error("Creator 返回了无效的修改回执。");
  }
  return value.receipt;
}

function creatorAgentMessages(messages: CreatorMessage[]): Message[] {
  return messages.flatMap((message): Message[] => {
    if (message.role === "user") {
      return [{ id: message.id, role: "user", content: message.content }];
    }
    if (message.role === "assistant") {
      return [{ id: message.id, role: "assistant", content: message.content }];
    }
    return [];
  });
}

function storedItem(value: unknown): CreatorConversationItem | undefined {
  if (!isRecord(value) || typeof value.id !== "string") {
    return undefined;
  }

  if (
    value.kind === "tool" &&
    typeof value.name === "string" &&
    typeof value.arguments === "string" &&
    (value.status === "preparing" ||
      value.status === "running" ||
      value.status === "completed" ||
      value.status === "failed")
  ) {
    const interrupted =
      value.status === "preparing" || value.status === "running";
    return {
      kind: "tool",
      id: value.id,
      name: value.name,
      arguments: value.arguments,
      ...(typeof value.result === "string" ? { result: value.result } : {}),
      ...(typeof value.error === "string"
        ? { error: value.error }
        : interrupted
          ? { error: "页面刷新时该工具调用尚未结束。" }
          : {}),
      status: interrupted ? "failed" : value.status,
    };
  }

  const role = value.role;
  if (
    (value.kind === "message" || value.kind === undefined) &&
    (role === "user" || role === "assistant" || role === "error") &&
    typeof value.content === "string"
  ) {
    return {
      kind: "message",
      id: value.id,
      role,
      content: value.content,
      ...(isCreatorRunReceipt(value.receipt) ? { receipt: value.receipt } : {}),
      streaming: false,
    };
  }

  return undefined;
}

function parsedItems(value: unknown): CreatorConversationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const parsed = storedItem(item);
    return parsed === undefined ? [] : [parsed];
  });
}

function parsedAgentMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((message) => {
    const parsed = MessageSchema.safeParse(message);
    return parsed.success ? [parsed.data] : [];
  });
}

function storedConversation(): StoredCreatorConversation {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "null",
    );

    if (Array.isArray(value)) {
      const items = parsedItems(value);
      const textMessages = items.filter(
        (item): item is CreatorMessage => item.kind === "message",
      );
      return {
        threadId: crypto.randomUUID(),
        items,
        agentMessages: creatorAgentMessages(textMessages),
      };
    }

    if (isRecord(value) && typeof value.threadId === "string") {
      return {
        threadId: value.threadId,
        items: parsedItems(value.items),
        agentMessages: parsedAgentMessages(value.agentMessages),
      };
    }
  } catch {
    // A corrupt development-only session should not prevent the preview loading.
  }

  return {
    threadId: crypto.randomUUID(),
    items: [],
    agentMessages: [],
  };
}

function saveConversation(
  agent: HttpAgent,
  items: CreatorConversationItem[],
): void {
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      threadId: agent.threadId,
      items: items.slice(-60),
      agentMessages: agent.messages,
    } satisfies StoredCreatorConversation),
  );
}

function CreatorMarkdown({ content }: { content: string }) {
  return (
    <div className="creator-markdown">
      <ReactMarkdown remarkPlugins={markdownPlugins}>{content}</ReactMarkdown>
    </div>
  );
}

function CreatorReceipt({ receipt }: { receipt: CreatorRunReceipt }) {
  return (
    <section className="creator-receipt" aria-label="修改回执">
      <header className="creator-receipt-header">
        <strong>修改回执</strong>
        <span>
          {receipt.files.length} 个文件 · {receipt.validations.length} 项验证
        </span>
      </header>

      <div className="creator-receipt-section">
        <h2>文件修改</h2>
        {receipt.files.length === 0 ? (
          <div className="creator-receipt-empty">未检测到文件修改</div>
        ) : (
          receipt.files.map((file) => (
            <details className="creator-receipt-item" key={file.path}>
              <summary>
                <span className={`creator-receipt-status creator-receipt-status--${file.status}`}>
                  {fileStatusLabels[file.status]}
                </span>
                <code>{file.path}</code>
              </summary>
              <pre aria-label={`${file.path} Diff`}>
                <code>{file.diff}</code>
              </pre>
              {file.truncated ? (
                <div className="creator-receipt-note">Diff 已截断</div>
              ) : null}
            </details>
          ))
        )}
      </div>

      <div className="creator-receipt-section">
        <h2>验证结果</h2>
        {receipt.validations.length === 0 ? (
          <div className="creator-receipt-empty">未运行验证</div>
        ) : (
          receipt.validations.map((validation, index) => (
            <details
              className="creator-receipt-item"
              key={`${validation.command}-${index}`}
            >
              <summary>
                <span
                  className={`creator-receipt-status creator-receipt-status--${validation.status}`}
                >
                  {validationStatusLabels[validation.status]}
                </span>
                <code>{validation.command}</code>
              </summary>
              <div className="creator-receipt-meta">
                退出码：{validation.exitCode ?? "不可用"}
              </div>
              <pre aria-label={`${validation.command} 输出`}>
                <code>{validation.output || "（命令无输出）"}</code>
              </pre>
              {validation.truncated ? (
                <div className="creator-receipt-note">验证输出已截断</div>
              ) : null}
            </details>
          ))
        )}
      </div>
    </section>
  );
}

function CreatorToolActivityCard({
  activity,
}: {
  activity: CreatorToolActivity;
}) {
  return (
    <article
      aria-label={`工具调用 ${activity.name}`}
      className={`creator-tool-activity creator-tool-activity--${activity.status}`}
    >
      <header>
        <span className="creator-tool-activity-dot" aria-hidden="true" />
        <strong>{activity.name}</strong>
        <small>{toolStatusLabels[activity.status]}</small>
      </header>

      {activity.arguments === "" ? null : (
        <details open={activity.status === "preparing"}>
          <summary>调用参数</summary>
          <pre>
            <code>{activity.arguments}</code>
          </pre>
        </details>
      )}

      {activity.result === undefined ? null : (
        <details open={activity.status === "failed"}>
          <summary>工具结果</summary>
          <pre>
            <code>{activity.result}</code>
          </pre>
        </details>
      )}

      {activity.error === undefined ? null : (
        <p className="creator-tool-activity-error">{activity.error}</p>
      )}
    </article>
  );
}

export function CreatorWorkbench({ children }: CreatorWorkbenchProps) {
  const [initialConversation] = useState(storedConversation);
  const [items, setItems] = useState<CreatorConversationItem[]>(
    initialConversation.items,
  );
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [isResizing, setIsResizing] = useState(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const messageList = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const resizeStart = useRef<{
    pointerId: number;
    x: number;
    width: number;
  } | null>(null);
  const itemsRef = useRef(items);
  const agentRef = useRef<HttpAgent | null>(null);

  const updateItems = (
    updater: (current: CreatorConversationItem[]) => CreatorConversationItem[],
  ) => {
    setItems((current) => {
      const next = updater(current);
      itemsRef.current = next;
      return next;
    });
  };

  if (agentRef.current === null) {
    agentRef.current = new HttpAgent({
      url: CREATOR_API_PATH,
      threadId: initialConversation.threadId,
      initialMessages: initialConversation.agentMessages,
    });
  }

  useEffect(() => {
    const agent = agentRef.current;
    if (agent !== null) {
      saveConversation(agent, items);
    }
    messageList.current?.scrollTo({
      top: messageList.current.scrollHeight,
      behavior: "smooth",
    });
  }, [items]);

  useEffect(
    () => () => {
      agentRef.current?.abortRun();
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const start = resizeStart.current;
      if (start === null || start.pointerId !== event.pointerId) {
        return;
      }
      setPanelWidth(
        clampCreatorPanelWidth(start.width + start.x - event.clientX),
      );
    };
    const finishResize = () => {
      resizeStart.current = null;
      setIsResizing(false);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (resizeStart.current?.pointerId !== event.pointerId) {
        return;
      }
      finishResize();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("blur", finishResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("blur", finishResize);
    };
  }, []);

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const request = input.trim();
    if (request === "" || isRunning) {
      return;
    }
    const agent = agentRef.current;
    if (agent === null) {
      return;
    }

    setInput("");
    setIsRunning(true);
    const userMessageId = crypto.randomUUID();
    updateItems((current) => [
      ...current,
      {
        kind: "message",
        id: userMessageId,
        role: "user",
        content: request,
      },
    ]);
    agent.addMessage({
      id: userMessageId,
      role: "user",
      content: request,
    });
    let latestAssistantMessageId: string | undefined;
    let runErrorHandled = false;

    try {
      const result = await agent.runAgent({}, {
        onTextMessageStartEvent({ event }) {
          latestAssistantMessageId = event.messageId;
          updateItems((current) =>
            current.some((item) => item.id === event.messageId)
              ? current
              : [
                  ...current,
                  {
                    kind: "message",
                    id: event.messageId,
                    role: "assistant",
                    content: "",
                    streaming: true,
                  },
                ],
          );
        },
        onTextMessageContentEvent({ event }) {
          updateItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.id === event.messageId
                ? { ...item, content: `${item.content}${event.delta}` }
                : item,
            ),
          );
        },
        onTextMessageEndEvent({ event }) {
          updateItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.id === event.messageId
                ? { ...item, streaming: false }
                : item,
            ),
          );
        },
        onToolCallStartEvent({ event }) {
          updateItems((current) =>
            current.some(
              (item) => item.kind === "tool" && item.id === event.toolCallId,
            )
              ? current
              : [
                  ...current,
                  {
                    kind: "tool",
                    id: event.toolCallId,
                    name: event.toolCallName,
                    arguments: "",
                    status: "preparing",
                  },
                ],
          );
        },
        onToolCallArgsEvent({ event }) {
          updateItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? { ...item, arguments: `${item.arguments}${event.delta}` }
                : item,
            ),
          );
        },
        onToolCallEndEvent({ event }) {
          updateItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? { ...item, status: "running" }
                : item,
            ),
          );
        },
        onToolCallResultEvent({ event }) {
          const metadata = isRecord(event.metadata) ? event.metadata : {};
          const failed =
            metadata.status === "error" || typeof metadata.error === "string";
          updateItems((current) =>
            current.map((item) =>
              item.kind === "tool" && item.id === event.toolCallId
                ? {
                    ...item,
                    result: event.content,
                    ...(typeof metadata.error === "string"
                      ? { error: metadata.error }
                      : {}),
                    status: failed ? "failed" : "completed",
                  }
                : item,
            ),
          );
        },
        onRunErrorEvent({ event }) {
          runErrorHandled = true;
          updateItems((current) => [
            ...current.map((item) =>
              item.kind === "message" && item.streaming === true
                ? { ...item, streaming: false }
                : item.kind === "tool" &&
                    (item.status === "preparing" || item.status === "running")
                  ? { ...item, status: "failed" as const, error: event.message }
                  : item,
            ),
            {
              kind: "message",
              id: crypto.randomUUID(),
              role: "error",
              content: event.message,
            },
          ]);
        },
      });
      const receipt = receiptFromRunResult(result.result);
      if (receipt !== undefined) {
        if (latestAssistantMessageId === undefined) {
          updateItems((current) => [
            ...current,
            {
              kind: "message",
              id: crypto.randomUUID(),
              role: "assistant",
              content: "Creator 已完成本次处理。",
              receipt,
              streaming: false,
            },
          ]);
        } else {
          const receiptMessageId = latestAssistantMessageId;
          updateItems((current) =>
            current.map((item) =>
              item.kind === "message" && item.id === receiptMessageId
                ? { ...item, receipt, streaming: false }
                : item,
            ),
          );
        }
      }
    } catch (error) {
      if (!runErrorHandled) {
        const message = error instanceof Error ? error.message : String(error);
        updateItems((current) => [
          ...current.map((item) =>
            item.kind === "message" && item.streaming === true
              ? { ...item, streaming: false }
              : item.kind === "tool" &&
                  (item.status === "preparing" || item.status === "running")
                ? { ...item, status: "failed" as const, error: message }
                : item,
          ),
          {
            kind: "message",
            id: crypto.randomUUID(),
            role: "error",
            content: message,
          },
        ]);
      }
    } finally {
      saveConversation(agent, itemsRef.current);
      setIsRunning(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const startPanelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const currentWidth = panel.current?.getBoundingClientRect().width;
    if (currentWidth === undefined) {
      return;
    }
    event.preventDefault();
    resizeStart.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      width: currentWidth,
    };
    setIsResizing(true);
  };

  const resizePanelWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const currentWidth =
      panelWidth ?? panel.current?.getBoundingClientRect().width;
    if (currentWidth === undefined) {
      return;
    }
    const direction = event.key === "ArrowLeft" ? 1 : -1;
    setPanelWidth(
      clampCreatorPanelWidth(
        currentWidth + direction * CREATOR_PANEL_KEYBOARD_STEP,
      ),
    );
  };

  return (
    <div
      className="creator-workbench"
      data-creator-panel-open={isOpen}
      data-creator-panel-resizing={isResizing}
      style={
        panelWidth === null
          ? undefined
          : ({
              "--creator-panel-width": `${panelWidth}px`,
            } as CSSProperties)
      }
    >
      <section className="creator-workbench-preview" aria-label="智能体前端预览">
        {children}
      </section>

      {isOpen ? (
        <aside className="creator-panel" aria-label="Creator 智能体" ref={panel}>
          <div
            aria-label="调整 Creator 面板宽度"
            aria-orientation="vertical"
            className="creator-panel-resizer"
            onDoubleClick={() => setPanelWidth(null)}
            onKeyDown={resizePanelWithKeyboard}
            onPointerDown={startPanelResize}
            role="separator"
            tabIndex={0}
            title="拖动调整宽度，双击恢复默认"
          />
          <header className="creator-panel-header">
            <div>
              <span>仅用于开发</span>
              <h1>Creator 智能体</h1>
            </div>
            <button
              aria-label="关闭 Creator 面板"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="creator-panel-messages" ref={messageList}>
            {items.length === 0 ? (
              <div className="creator-panel-empty">
                <strong>描述你想做的前端修改。</strong>
                <p>Creator 可以修改本项目的 app-ui 和 UI Plugin 源码。</p>
              </div>
            ) : (
              items.map((item) =>
                item.kind === "tool" ? (
                  <CreatorToolActivityCard activity={item} key={item.id} />
                ) : (
                  <article
                    className={`creator-panel-message creator-panel-message--${item.role}`}
                    key={item.id}
                  >
                    <span>{roleLabels[item.role]}</span>
                    {item.role === "assistant" ? (
                      <CreatorMarkdown content={item.content} />
                    ) : (
                      <p>{item.content}</p>
                    )}
                    {item.streaming === true ? (
                      <span
                        className="creator-stream-cursor"
                        aria-hidden="true"
                      />
                    ) : null}
                    {item.receipt === undefined ? null : (
                      <CreatorReceipt receipt={item.receipt} />
                    )}
                  </article>
                ),
              )
            )}
            {isRunning ? (
              <p className="creator-panel-running" role="status">
                Creator 正在检查并修改项目…
              </p>
            ) : null}
          </div>

          <form className="creator-panel-composer" onSubmit={submit}>
            <label htmlFor="creator-request">修改需求</label>
            <textarea
              disabled={isRunning}
              id="creator-request"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="例如：右边增加一个工具调用详情面板"
              rows={3}
              value={input}
            />
            <div>
              <small>Enter 发送 · Shift+Enter 换行</small>
              <button disabled={isRunning || input.trim() === ""} type="submit">
                {isRunning ? "处理中…" : "发送"}
              </button>
            </div>
          </form>
        </aside>
      ) : (
        <button
          className="creator-panel-open"
          onClick={() => setIsOpen(true)}
          type="button"
        >
          打开 Creator
        </button>
      )}
    </div>
  );
}
