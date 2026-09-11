import { useRef, useState, type ReactNode } from "react";

import { AgentComposer } from "../../agent-ui/components/composer";
import {
  AgentComposerSuggestions,
  getAgentComposerSuggestionOptionId,
} from "../../agent-ui/components/composer-suggestions";
import {
  AgentConversationGroup,
  AgentConversationItem,
  AgentConversationList,
  AgentConversationState,
} from "../../agent-ui/components/conversation-list";
import { AgentMessage } from "../../agent-ui/components/message";
import {
  AgentAttachment,
  AgentAttachments,
} from "../../agent-ui/components/attachments";
import {
  AgentReasoning,
  type AgentReasoningStatus,
} from "../../agent-ui/components/reasoning";
import { AgentThread } from "../../agent-ui/components/thread";
import { AgentSource, AgentSources } from "../../agent-ui/components/sources";
import {
  AgentTool,
  type AgentToolStatus,
} from "../../agent-ui/components/tool";
import {
  AgentToolActivity,
  type AgentToolActivityStatus,
} from "../../agent-ui/components/tool-activity";
import {
  AgentToolDetail,
  type AgentToolDetailStatus,
} from "../../agent-ui/components/tool-detail";
import { AgentUIRoot, type AgentUITheme } from "../../agent-ui/foundation/AgentUIRoot";
import { Avatar, AvatarBadge, AvatarFallback } from "../../agent-ui/primitives/avatar";
import { Badge } from "../../agent-ui/primitives/badge";
import { Button } from "../../agent-ui/primitives/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../agent-ui/primitives/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../agent-ui/primitives/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../agent-ui/primitives/dropdown-menu";
import { Input } from "../../agent-ui/primitives/input";
import { Label } from "../../agent-ui/primitives/label";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../../agent-ui/primitives/popover";
import { Separator } from "../../agent-ui/primitives/separator";
import { Skeleton } from "../../agent-ui/primitives/skeleton";
import { Spinner } from "../../agent-ui/primitives/spinner";
import { ScrollArea, ScrollBar } from "../../agent-ui/primitives/scroll-area";
import { Switch } from "../../agent-ui/primitives/switch";
import {
  AgentSuggestion,
  AgentSuggestions,
} from "../../agent-ui/components/suggestions";
import { AgentThreadWelcome } from "../../agent-ui/components/thread-welcome";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../agent-ui/primitives/tabs";
import { Textarea } from "../../agent-ui/primitives/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../agent-ui/primitives/tooltip";
import styles from "./agent-ui-primitive-gallery.module.css";

const swatches = [
  ["Background", "--aui-bg"],
  ["Elevated", "--aui-bg-elevated"],
  ["Muted", "--aui-bg-muted"],
  ["Accent", "--aui-accent"],
  ["Danger", "--aui-danger"],
  ["Border", "--aui-border"],
] as const;

interface ComposerFixtureProps {
  label: string;
  initialValue?: string;
  running?: boolean;
  disabled?: boolean;
  actions?: ReactNode;
}

function ComposerFixture({
  label,
  initialValue = "",
  running = false,
  disabled = false,
  actions,
}: ComposerFixtureProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <article className={styles.composerFixture}>
      <span className={styles.fixtureLabel}>{label}</span>
      <AgentComposer
        value={value}
        onValueChange={setValue}
        onSubmit={() => undefined}
        running={running}
        {...(running ? { onStop: () => undefined } : {})}
        disabled={disabled}
        actions={actions}
      />
    </article>
  );
}

function ComposerSuggestionsFixture({ theme }: { theme: AgentUITheme }) {
  const [value, setValue] = useState("/");
  const [activeIndex, setActiveIndex] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const listId = `${theme}-composer-suggestions`;
  const items = [
    {
      id: "summary",
      label: "总结当前会话",
      value: "请总结当前会话，并列出下一步。",
      description: "提炼目标、约束和下一步",
    },
    {
      id: "tool",
      label: "解释最近一次工具调用",
      value: "请解释最近一次工具调用的输入、输出和结论。",
    },
  ];

  return (
    <article className={styles.composerFixture}>
      <span className={styles.fixtureLabel}>Composer Suggestions</span>
      <div ref={anchor}>
        <AgentComposer
          value={value}
          onValueChange={setValue}
          onSubmit={() => undefined}
          inputProps={{
            "aria-autocomplete": "list",
            "aria-haspopup": "listbox",
            "aria-expanded": true,
            "aria-controls": listId,
            "aria-activedescendant": getAgentComposerSuggestionOptionId(
              listId,
              items[activeIndex]!.id,
            ),
          }}
        />
        <AgentComposerSuggestions
          open
          items={items}
          activeIndex={activeIndex}
          anchor={anchor}
          listId={listId}
          onActiveIndexChange={setActiveIndex}
          onSelect={(item) => setValue(`${item.value} `)}
        />
      </div>
    </article>
  );
}

function MessageGallery() {
  return (
    <div className={styles.messageGrid}>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>User</span>
        <AgentMessage role="user">
          Can you summarize what changed in the project today?
        </AgentMessage>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Assistant</span>
        <AgentMessage role="assistant" header="Assistant">
          The Composer migration is complete.
        </AgentMessage>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Assistant multiline</span>
        <AgentMessage role="assistant" header="Assistant">
          <div className={styles.messageParagraphs}>
            <p>The new message surface keeps the response focused on its content.</p>
            <p>Additional paragraphs follow the same open reading flow without becoming a card.</p>
            <p>The component path packages/source-registry/registry/items/agent-component-message/files/components/message.tsx wraps safely.</p>
          </div>
        </AgentMessage>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Streaming</span>
        <AgentMessage
          role="assistant"
          status="streaming"
          footer={<span>Generating…</span>}
        >
          I’m analyzing the current implementation…
        </AgentMessage>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Error</span>
        <AgentMessage
          role="assistant"
          status="error"
          footer={<span>Generation failed</span>}
          actions={(
            <Button type="button" variant="ghost" size="sm">
              Retry
            </Button>
          )}
        >
          Partial response before the error.
        </AgentMessage>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>With meta / actions</span>
        <AgentMessage
          role="assistant"
          header="Assistant"
          footer="Just now"
          actions={(
            <>
              <Button type="button" variant="ghost" size="sm">Copy</Button>
              <Button type="button" variant="ghost" size="sm">Retry</Button>
            </>
          )}
        >
          Hover this message or move keyboard focus into its actions.
        </AgentMessage>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>System</span>
        <AgentMessage role="system">
          Conversation context updated
        </AgentMessage>
      </article>
    </div>
  );
}

function AttachmentsGallery() {
  return (
    <div className={styles.messageGrid}>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Single file</span>
        <AgentAttachments ariaLabel="Single attachment">
          <AgentAttachment name="report.pdf" kind="file" href="https://example.com/report.pdf" />
        </AgentAttachments>
      </article>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Media kinds</span>
        <AgentAttachments ariaLabel="Media attachments">
          <AgentAttachment name="screenshot.png" kind="image" href="https://example.com/screenshot.png" />
          <AgentAttachment name="briefing.mp3" kind="audio" />
          <AgentAttachment name="demo.mp4" kind="video" />
        </AgentAttachments>
      </article>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Multiple / wrap</span>
        <AgentAttachments>
          <AgentAttachment name="requirements.md" kind="file" />
          <AgentAttachment name="architecture.svg" kind="image" />
          <AgentAttachment name="notes.txt" kind="file" />
          <AgentAttachment name="a-very-long-filename-that-must-stay-inside-the-message-surface.pdf" kind="file" />
        </AgentAttachments>
      </article>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Optional regions / no href</span>
        <AgentAttachments>
          <AgentAttachment
            name="preview.png"
            kind="image"
            preview={<span aria-hidden="true">▧</span>}
            description="PNG · 128 KB"
            trailing="Ready"
          />
        </AgentAttachments>
      </article>
    </div>
  );
}

function SourcesGallery() {
  return (
    <div className={styles.messageGrid}>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Single</span>
        <AgentSources title="来源 · 1" ariaLabel="Single source">
          <AgentSource title="OpenAI Docs" href="https://platform.openai.com/docs" index={1} />
        </AgentSources>
      </article>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Multiple / description</span>
        <AgentSources title="来源 · 3">
          <AgentSource title="AG-UI specification" href="https://docs.ag-ui.com" description="Event protocol" index={1} />
          <AgentSource title="Runtime API" description="Generated project contract" index={2} />
          <AgentSource title="Agent UI Reference Guide" index={3} />
        </AgentSources>
      </article>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Long title / optional regions</span>
        <AgentSources title="Sources · 1">
          <AgentSource
            title="A long source title that wraps naturally without escaping the message reading track"
            description="No URL is required for a source to remain visible."
            index={1}
            trailing="Local"
          />
        </AgentSources>
      </article>
    </div>
  );
}

interface ReasoningFixtureProps {
  fixtureLabel: string;
  status: AgentReasoningStatus;
  initialExpanded: boolean;
  label: ReactNode;
  children: ReactNode;
}

function ReasoningFixture({
  fixtureLabel,
  status,
  initialExpanded,
  label,
  children,
}: ReasoningFixtureProps) {
  const [expanded, setExpanded] = useState(initialExpanded);

  return (
    <article className={styles.messageFixture}>
      <span className={styles.fixtureLabel}>{fixtureLabel}</span>
      <AgentMessage role="assistant" header="Assistant">
        <AgentReasoning
          status={status}
          expanded={expanded}
          onExpandedChange={setExpanded}
          label={label}
        >
          {children}
        </AgentReasoning>
      </AgentMessage>
    </article>
  );
}

function ReasoningGallery() {
  return (
    <div className={styles.messageGrid}>
      <ReasoningFixture
        fixtureLabel="Running / Expanded"
        status="running"
        initialExpanded
        label="正在思考"
      >
        {"正在读取项目结构……\n分析插件依赖……\n检查 Runtime 状态……"}
      </ReasoningFixture>

      <ReasoningFixture
        fixtureLabel="Completed / Expanded"
        status="completed"
        initialExpanded
        label="思考过程"
      >
        分析已经完成，组件边界与现有 Agent UI Foundation 保持一致。
      </ReasoningFixture>

      <ReasoningFixture
        fixtureLabel="Completed / Collapsed"
        status="completed"
        initialExpanded={false}
        label="思考过程"
      >
        完整的推理内容仍由调用方提供，并可按需重新展开。
      </ReasoningFixture>

      <ReasoningFixture
        fixtureLabel="Interrupted"
        status="interrupted"
        initialExpanded
        label="思考已停止"
      >
        推理被中断，已保留中断前可见的内容。
      </ReasoningFixture>

      <ReasoningFixture
        fixtureLabel="Long Reasoning"
        status="completed"
        initialExpanded
        label="详细思考过程"
      >
        {[
          "读取当前 AppUIModel 与已安装 Source Item。",
          "确认 Agent Message 已经提供 reasoning slot。",
          "检查 ReasoningRenderContext 的现有状态集合。",
          "保持 running、completed、interrupted 三种状态。",
          "将展开状态继续留给调用方控制。",
          "使用 owned Collapsible 保留 disclosure 语义。",
          "使用 owned Spinner 表达 running 状态。",
          "避免引入 Runtime、AG-UI 或 Plugin 类型。",
          "让 label 保持 caller-owned，便于产品文案和本地化。",
          "使用稳定 data-slot 暴露组件结构。",
          "通过 semantic token 保持 Light 与 Dark 一致。",
          "保留长内容换行，不引入 Markdown 排版职责。",
        ].join("\n")}
      </ReasoningFixture>
    </div>
  );
}

interface ToolFixtureProps {
  fixtureLabel: string;
  status: AgentToolStatus;
  initialExpanded: boolean;
  name: string;
  statusLabel: string;
  summary?: string;
  children: ReactNode;
}

function ToolFixture({
  fixtureLabel,
  status,
  initialExpanded,
  name,
  statusLabel,
  summary,
  children,
}: ToolFixtureProps) {
  const [expanded, setExpanded] = useState(initialExpanded);

  return (
    <article className={styles.messageFixture}>
      <span className={styles.fixtureLabel}>{fixtureLabel}</span>
      <AgentMessage role="assistant" header="Assistant">
        <AgentTool
          status={status}
          expanded={expanded}
          onExpandedChange={setExpanded}
          name={name}
          {...(summary === undefined ? {} : { summary })}
          statusLabel={statusLabel}
        >
          <div className={styles.toolOperation}>{children}</div>
        </AgentTool>
      </AgentMessage>
    </article>
  );
}

function ToolField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.toolField}>
      <span className={styles.toolFieldLabel}>{label}</span>
      <span className={styles.toolFieldValue}>{value}</span>
    </div>
  );
}

function ToolGallery() {
  return (
    <div className={styles.messageGrid}>
      <ToolFixture
        fixtureLabel="Running / Expanded"
        status="running"
        initialExpanded
        name="inspect_project"
        summary="工具调用 · 正在执行"
        statusLabel="执行中"
      >
        <ToolField label="输入" value={"path  /src"} />
        <span className={styles.toolPending}>等待工具返回结果…</span>
      </ToolFixture>

      <ToolFixture
        fixtureLabel="Running / Collapsed"
        status="running"
        initialExpanded={false}
        name="search_files"
        summary="工具调用 · 正在执行"
        statusLabel="执行中"
      >
        <ToolField label="输入" value={"query  *.tsx"} />
      </ToolFixture>

      <ToolFixture
        fixtureLabel="Completed / Collapsed"
        status="completed"
        initialExpanded={false}
        name="search_files"
        summary="工具调用 · 3 个结果"
        statusLabel="已完成"
      >
        <ToolField label="输出" value="3 files" />
      </ToolFixture>

      <ToolFixture
        fixtureLabel="Completed / Expanded"
        status="completed"
        initialExpanded
        name="search_files"
        summary="工具调用 · 3 个结果"
        statusLabel="已完成"
      >
        <ToolField label="输入" value={"query  *.tsx"} />
        <ToolField
          label="输出"
          value={
            "src/App.tsx\nsrc/dev/AgentUIPrimitiveGallery.tsx\nsrc/main.tsx"
          }
        />
      </ToolFixture>

      <ToolFixture
        fixtureLabel="Error / Expanded"
        status="error"
        initialExpanded
        name="write_file"
        summary="工具调用 · 执行失败"
        statusLabel="失败"
      >
        <ToolField label="输入" value={"path  /etc/hosts"} />
        <ToolField label="错误" value="Permission denied" />
      </ToolFixture>

      <ToolFixture
        fixtureLabel="Interrupted / Collapsed"
        status="interrupted"
        initialExpanded={false}
        name="run_tests"
        summary="工具调用 · 未返回结果"
        statusLabel="未完成"
      >
        <ToolField label="输出" value="未返回结果。" />
      </ToolFixture>

      <ToolFixture
        fixtureLabel="Long Result / Expanded"
        status="completed"
        initialExpanded
        name="read_config"
        summary="工具调用 · 已返回结果"
        statusLabel="已完成"
      >
        <ToolField label="输入" value={"path  agent-ui/app-ui.json"} />
        <ToolField
          label="输出"
          value={[
            "{",
            '  "schemaVersion": 1,',
            '  "root": {',
            '    "type": "column",',
            '    "children": [',
            '      { "type": "slot", "slotId": "agent-messages-main" },',
            '      { "type": "slot", "slotId": "agent-composer-main" }',
            "    ]",
            "  },",
            '  "pluginInstances": {',
            '    "agent-messages-main": { "pluginId": "agent-message-list" },',
            '    "agent-composer-main": { "pluginId": "agent-composer" }',
            "  }",
            "}",
          ].join("\n")}
        />
      </ToolFixture>
    </div>
  );
}

function ToolDetailSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.toolDetailSection}>
      <span className={styles.toolFieldLabel}>{label}</span>
      {children}
    </div>
  );
}

function ToolDetailFixture({
  fixtureLabel,
  status,
  name,
}: {
  fixtureLabel: string;
  status: AgentToolDetailStatus;
  name: string;
}) {
  const statusLabel = status === "running"
    ? "执行中"
    : status === "completed"
      ? "已完成"
      : status === "error"
        ? "失败"
        : "已中断";

  return (
    <article className={styles.messageFixture}>
      <span className={styles.fixtureLabel}>{fixtureLabel}</span>
      <AgentToolDetail
        state="selected"
        title="工具详情"
        meta="最近一次调用"
        status={status}
        name={name}
        statusLabel={statusLabel}
        toolCallId={`Call ID · call_${name}_01`}
        argumentsContent={(
          <ToolDetailSection label="Arguments">
            <pre className={styles.toolDetailCode}>{`{\n  "path": "src/App.tsx"\n}`}</pre>
          </ToolDetailSection>
        )}
        resultContent={(
          <ToolDetailSection label={status === "error" ? "Error" : "Result"}>
            <pre className={styles.toolDetailCode}>
              {status === "running"
                ? "等待工具返回结果…"
                : status === "error"
                  ? "Permission denied"
                  : status === "interrupted"
                    ? "调用已停止，未返回结果。"
                    : "读取完成：128 lines"}
            </pre>
          </ToolDetailSection>
        )}
      />
    </article>
  );
}

function ToolDetailGallery() {
  return (
    <div className={styles.messageGrid}>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Running / Caller-owned selector</span>
        <AgentToolDetail
          state="selected"
          title="工具详情"
          meta="3 个调用"
          selector={(
            <select
              aria-label="选择工具调用"
              className={styles.toolDetailSelect}
              defaultValue="inspect_project"
            >
              <option value="inspect_project">inspect_project</option>
              <option value="search_files">search_files</option>
              <option value="read_file">read_file</option>
            </select>
          )}
          status="running"
          name="inspect_project"
          statusLabel="执行中"
          toolCallId="Call ID · call_inspect_project_01"
          argumentsContent={(
            <ToolDetailSection label="Arguments">
              <pre className={styles.toolDetailCode}>{`{\n  "root": "src"\n}`}</pre>
            </ToolDetailSection>
          )}
          resultContent={(
            <ToolDetailSection label="Result">
              <span className={styles.toolPending}>等待工具返回结果…</span>
            </ToolDetailSection>
          )}
        />
      </article>

      <ToolDetailFixture
        fixtureLabel="Completed"
        status="completed"
        name="read_file"
      />
      <ToolDetailFixture
        fixtureLabel="Error"
        status="error"
        name="write_file"
      />
      <ToolDetailFixture
        fixtureLabel="Interrupted"
        status="interrupted"
        name="run_tests"
      />

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Empty</span>
        <AgentToolDetail
          state="empty"
          title="工具详情"
          meta="0 个调用"
          emptyState="当前会话还没有工具调用。"
        />
      </article>
    </div>
  );
}

interface ToolActivityFixtureProps {
  fixtureLabel: string;
  presentation: "grouped" | "flat";
  status: AgentToolActivityStatus;
  initialExpanded?: boolean;
  summary?: string;
  children: ReactNode;
}

function ToolActivityFixture({
  fixtureLabel,
  presentation,
  status,
  initialExpanded = false,
  summary,
  children,
}: ToolActivityFixtureProps) {
  const [expanded, setExpanded] = useState(initialExpanded);

  return (
    <article className={styles.messageFixture}>
      <span className={styles.fixtureLabel}>{fixtureLabel}</span>
      <AgentMessage role="assistant" header="Assistant">
        {presentation === "flat" ? (
          <AgentToolActivity presentation="flat" status={status}>
            {children}
          </AgentToolActivity>
        ) : (
          <AgentToolActivity
            presentation="grouped"
            status={status}
            expanded={expanded}
            onExpandedChange={setExpanded}
            summary={summary}
          >
            {children}
          </AgentToolActivity>
        )}
      </AgentMessage>
    </article>
  );
}

function ToolActivityChild({
  name,
  status,
}: {
  name: string;
  status: AgentToolStatus;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusLabel = status === "running"
    ? "执行中"
    : status === "completed"
      ? "已完成"
      : status === "error"
        ? "失败"
        : "未完成";

  return (
    <AgentTool
      status={status}
      expanded={expanded}
      onExpandedChange={setExpanded}
      name={name}
      summary={`工具调用 · ${statusLabel}`}
      statusLabel={statusLabel}
    >
      <div className={styles.toolOperation}>
        <ToolField label="输入" value={`target  ${name}`} />
        <ToolField
          label={status === "error" ? "错误" : "输出"}
          value={status === "running"
            ? "等待工具返回结果…"
            : status === "error"
              ? "Permission denied"
              : status === "interrupted"
                ? "未返回结果"
                : `${name} completed`}
        />
      </div>
    </AgentTool>
  );
}

function ToolActivityGallery() {
  return (
    <div className={styles.messageGrid}>
      <ToolActivityFixture
        fixtureLabel="Grouped Running / Collapsed"
        presentation="grouped"
        status="running"
        summary="正在调用 inspect_project"
      >
        <ToolActivityChild name="inspect_project" status="running" />
        <ToolActivityChild name="search_files" status="completed" />
      </ToolActivityFixture>

      <ToolActivityFixture
        fixtureLabel="Grouped Running / Expanded"
        presentation="grouped"
        status="running"
        initialExpanded
        summary="正在调用 2 个工具"
      >
        <ToolActivityChild name="inspect_project" status="running" />
        <ToolActivityChild name="search_files" status="running" />
      </ToolActivityFixture>

      <ToolActivityFixture
        fixtureLabel="Grouped Completed / Collapsed"
        presentation="grouped"
        status="completed"
        summary="使用了 2 个工具"
      >
        <ToolActivityChild name="inspect_project" status="completed" />
        <ToolActivityChild name="search_files" status="completed" />
      </ToolActivityFixture>

      <ToolActivityFixture
        fixtureLabel="Grouped Error / Expanded"
        presentation="grouped"
        status="error"
        initialExpanded
        summary="2 个工具 · 1 个失败"
      >
        <ToolActivityChild name="inspect_project" status="completed" />
        <ToolActivityChild name="write_file" status="error" />
      </ToolActivityFixture>

      <ToolActivityFixture
        fixtureLabel="Grouped Interrupted"
        presentation="grouped"
        status="interrupted"
        summary="2 个工具 · 1 个未完成"
      >
        <ToolActivityChild name="inspect_project" status="completed" />
        <ToolActivityChild name="run_tests" status="interrupted" />
      </ToolActivityFixture>

      <ToolActivityFixture
        fixtureLabel="Flat"
        presentation="flat"
        status="completed"
      >
        <ToolActivityChild name="inspect_project" status="completed" />
        <ToolActivityChild name="search_files" status="completed" />
      </ToolActivityFixture>
    </div>
  );
}

const longThreadMessages = [
  {
    role: "user",
    content: "Review the current Agent UI foundation and identify the next structural gap.",
  },
  {
    role: "assistant",
    content: "Composer and Message are ready. The conversation still needs an owned Thread surface.",
  },
  {
    role: "user",
    content: "Keep that surface independent from Runtime and AG-UI state.",
  },
  {
    role: "assistant",
    content: "The Thread accepts React children and exposes only its viewport and content DOM refs.",
  },
  {
    role: "user",
    content: "What owns the conversation reading width?",
  },
  {
    role: "assistant",
    content: "Thread owns the centered reading track while each Message keeps responsibility for its own role presentation.",
  },
  {
    role: "user",
    content: "Does this phase include follow-latest behavior?",
  },
  {
    role: "assistant",
    content: "No. Scroll intent and follow-latest remain separate runtime binding work for the next phase.",
  },
] as const;

function ShortThreadMessages() {
  return (
    <>
      <AgentMessage role="user">
        Help me analyze the current project.
      </AgentMessage>
      <AgentMessage role="assistant" header="Assistant">
        The project now has a standalone Message surface and is ready for Thread composition.
      </AgentMessage>
    </>
  );
}

function ThreadGallery() {
  return (
    <div className={styles.threadGrid}>
      <article className={styles.threadFixture}>
        <span className={styles.fixtureLabel}>Empty</span>
        <div className={styles.threadPreview}>
          <AgentThread
            ariaLabel="Empty conversation preview"
            empty={<div className={styles.threadEmpty}>Start a conversation</div>}
          />
        </div>
      </article>

      <article className={styles.threadFixture}>
        <span className={styles.fixtureLabel}>Short thread</span>
        <div className={styles.threadPreview}>
          <AgentThread ariaLabel="Short conversation preview">
            <ShortThreadMessages />
          </AgentThread>
        </div>
      </article>

      <article className={styles.threadFixture}>
        <span className={styles.fixtureLabel}>Long thread</span>
        <div className={styles.threadPreview}>
          <AgentThread ariaLabel="Scrollable conversation preview">
            {longThreadMessages.map((message, index) => (
              <AgentMessage
                role={message.role}
                header={message.role === "assistant" ? "Assistant" : undefined}
                key={index}
              >
                {message.content}
              </AgentMessage>
            ))}
          </AgentThread>
        </div>
      </article>

      <article className={styles.threadFixture}>
        <span className={styles.fixtureLabel}>Scroll to bottom affordance</span>
        <div className={styles.threadPreview}>
          <AgentThread
            ariaLabel="Conversation with scroll affordance preview"
            scrollToBottom={(
              <Button type="button" size="sm" variant="outline">
                ↓ Back to bottom
              </Button>
            )}
          >
            <ShortThreadMessages />
          </AgentThread>
        </div>
      </article>
    </div>
  );
}

function GalleryMarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 3.5v3.2" />
      <path d="M12 17.3v3.2" />
      <path d="M3.5 12h3.2" />
      <path d="M17.3 12h3.2" />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  );
}

function ThreadWelcomeGallery() {
  return (
    <div className={styles.messageGrid}>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Default</span>
        <AgentThreadWelcome
          title="Agent Frontend"
          description="通过 AG-UI 与 Agent Runtime 连接，开始新的任务或选择一个建议。"
        />
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Custom title / description</span>
        <AgentThreadWelcome
          title="研究助手"
          description="描述目标、约束与期望输出，我会先给出一个执行计划。"
          eyebrow="New task"
        />
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>With optional icon / meta</span>
        <AgentThreadWelcome
          icon={<GalleryMarkIcon />}
          title="Agent Frontend"
          description="通过 AG-UI 与 Agent Runtime 连接，开始新的任务或选择一个建议。"
          eyebrow="Connected"
          meta="最后同步 · 刚刚"
        />
      </article>
    </div>
  );
}

function SuggestionsGallery() {
  return (
    <div className={styles.messageGrid}>
      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Default</span>
        <AgentSuggestions title="你可以这样开始">
          <AgentSuggestion title="总结当前上下文" />
          <AgentSuggestion title="解释当前界面结构" />
          <AgentSuggestion title="建议下一步" />
        </AgentSuggestions>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>With descriptions</span>
        <AgentSuggestions title="你可以这样开始">
          <AgentSuggestion
            title="总结当前上下文"
            description="提炼目标、约束与下一步"
          />
          <AgentSuggestion
            title="解释当前界面结构"
            description="说明 AppUIModel 与插件的关系"
          />
          <AgentSuggestion
            title="建议下一步"
            description="给出一个可执行的后续动作"
          />
        </AgentSuggestions>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Disabled</span>
        <AgentSuggestions title="运行中">
          <AgentSuggestion
            title="总结当前上下文"
            description="等待当前运行结束"
            disabled
          />
          <AgentSuggestion title="解释当前界面结构" disabled />
        </AgentSuggestions>
      </article>

      <article className={styles.messageFixture}>
        <span className={styles.fixtureLabel}>Long text</span>
        <AgentSuggestions title="长文本建议">
          <AgentSuggestion
            title="请根据当前 AppUIModel、Plugin 运行时与共享 AG-UI 消息，总结最近的架构调整并列出仍然存在的风险。"
            description="说明每个结论对应的插件边界、Slot ownership 与后续验证步骤。"
          />
          <AgentSuggestion
            title="请解释 conversation.empty.welcome 与 conversation.empty.suggestions 为什么必须是平级 Slot。"
            description="用一句话说明可替换性，不要复述源码。"
          />
        </AgentSuggestions>
      </article>
    </div>
  );
}

function ConversationListFixture({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.conversationFixture}>
      <span className={styles.fixtureLabel}>{label}</span>
      <div className={styles.conversationPreview}>{children}</div>
    </article>
  );
}

function ConversationListGallery() {
  return (
    <div className={styles.conversationGrid}>
      <ConversationListFixture label="Default">
        <AgentConversationList title="会话" action={<Button size="sm" variant="ghost">＋ 新建</Button>}>
          <AgentConversationGroup label="当前">
            <AgentConversationItem title="当前会话" />
          </AgentConversationGroup>
          <AgentConversationGroup label="历史会话">
            <AgentConversationItem title="产品规划讨论" />
            <AgentConversationItem title="修复登录问题" />
          </AgentConversationGroup>
        </AgentConversationList>
      </ConversationListFixture>

      <ConversationListFixture label="Active live">
        <AgentConversationList title="会话" meta="3">
          <AgentConversationGroup label="当前">
            <AgentConversationItem active title="当前会话" />
          </AgentConversationGroup>
          <AgentConversationGroup label="历史会话">
            <AgentConversationItem title="UI 设计评审" />
          </AgentConversationGroup>
        </AgentConversationList>
      </ConversationListFixture>

      <ConversationListFixture label="Active history / Grouped / Disabled / Long title">
        <AgentConversationList title="会话" meta="4">
          <AgentConversationGroup label="当前">
            <AgentConversationItem title="当前会话" />
          </AgentConversationGroup>
          <AgentConversationGroup label="产品">
            <AgentConversationItem active title="产品规划讨论" />
            <AgentConversationItem title="为下一阶段 Agent Frontend Plugin Creator 制定完整而明确的交付计划" />
          </AgentConversationGroup>
          <AgentConversationGroup label="开发">
            <AgentConversationItem disabled title="修复登录问题" />
          </AgentConversationGroup>
        </AgentConversationList>
      </ConversationListFixture>

      <ConversationListFixture label="Loading state">
        <AgentConversationList title="会话">
          <AgentConversationGroup label="当前">
            <AgentConversationItem active title="当前会话" />
          </AgentConversationGroup>
          <AgentConversationGroup label="历史会话">
            <AgentConversationState kind="loading">正在加载历史会话…</AgentConversationState>
          </AgentConversationGroup>
        </AgentConversationList>
      </ConversationListFixture>

      <ConversationListFixture label="Error state">
        <AgentConversationList title="会话">
          <AgentConversationGroup label="当前">
            <AgentConversationItem active title="当前会话" />
          </AgentConversationGroup>
          <AgentConversationGroup label="历史会话">
            <AgentConversationState action={<Button size="sm" variant="ghost">重试</Button>} kind="error">
              <strong>加载会话失败</strong>
              <span>服务暂时不可用</span>
            </AgentConversationState>
          </AgentConversationGroup>
        </AgentConversationList>
      </ConversationListFixture>

      <ConversationListFixture label="No history">
        <AgentConversationList title="会话" meta="0">
          <AgentConversationGroup label="当前">
            <AgentConversationItem active title="当前会话" />
          </AgentConversationGroup>
          <AgentConversationGroup label="历史会话">
            <AgentConversationState kind="empty">暂无历史会话</AgentConversationState>
          </AgentConversationGroup>
        </AgentConversationList>
      </ConversationListFixture>
    </div>
  );
}

function ThemeGallery({ theme }: { theme: AgentUITheme }) {
  const inputId = `${theme}-gallery-input`;

  return (
    <AgentUIRoot theme={theme} className={styles.theme}>
      <header className={styles.themeHeader}>
        <div>
          <p className={styles.eyebrow}>
            Agent UI Foundation
          </p>
          <h1>{theme === "light" ? "Light" : "Dark"} theme</h1>
        </div>
        <span className={styles.status}>Development fixture</span>
      </header>

      <section className={styles.section}>
        <h2>Semantic tokens</h2>
        <div className={styles.swatches}>
          {swatches.map(([label, token]) => (
            <div className={styles.swatch} key={token}>
              <span style={{ background: `var(${token})` }} />
              <strong>{label}</strong>
              <code>{token}</code>
            </div>
          ))}
        </div>
        <div className={styles.textHierarchy}>
          <strong>Primary foreground</strong>
          <span>Muted supporting text</span>
          <small>Subtle metadata</small>
        </div>
      </section>

      <Separator />

      <section className={styles.section}>
        <h2>Button</h2>
        <div className={styles.row}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className={styles.row}>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Add">+</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary"><Spinner />Generating</Button>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Form controls</h2>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <Label htmlFor={inputId}>Search agents</Label>
            <Input id={inputId} placeholder="Search..." />
          </div>
          <div className={styles.field}>
            <Label disabled>Disabled</Label>
            <Input placeholder="Unavailable" disabled />
          </div>
          <div className={styles.field}>
            <Label>Invalid input</Label>
            <Input defaultValue="Invalid value" aria-invalid />
          </div>
          <div className={styles.field}>
            <Label>Agent instructions</Label>
            <Textarea placeholder="Describe what the agent should do..." />
          </div>
          <div className={styles.field}>
            <Label disabled>Disabled textarea</Label>
            <Textarea placeholder="Unavailable" disabled />
          </div>
          <div className={styles.field}>
            <Label>Invalid textarea</Label>
            <Textarea defaultValue="Needs revision" aria-invalid />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Agent Components</h2>
        <h3 className={styles.componentHeading}>Agent Thread Welcome</h3>
        <ThreadWelcomeGallery />
        <h3 className={styles.componentHeading}>Agent Suggestions</h3>
        <SuggestionsGallery />
        <h3 className={styles.componentHeading}>Agent Conversation List</h3>
        <ConversationListGallery />
        <h3 className={styles.componentHeading}>Agent Thread</h3>
        <ThreadGallery />
        <h3 className={styles.componentHeading}>Agent Message</h3>
        <MessageGallery />
        <h3 className={styles.componentHeading}>Agent Attachments</h3>
        <AttachmentsGallery />
        <h3 className={styles.componentHeading}>Agent Sources</h3>
        <SourcesGallery />
        <h3 className={styles.componentHeading}>Agent Reasoning</h3>
        <ReasoningGallery />
        <h3 className={styles.componentHeading}>Agent Tool</h3>
        <ToolGallery />
        <h3 className={styles.componentHeading}>Agent Tool Activity</h3>
        <ToolActivityGallery />
        <h3 className={styles.componentHeading}>Agent Tool Detail</h3>
        <ToolDetailGallery />
        <h3 className={styles.componentHeading}>Agent Composer</h3>
        <div className={styles.composerGrid}>
          <ComposerFixture label="Empty" />
          <ComposerFixture label="Draft" initialValue="Summarize the latest project activity." />
          <ComposerFixture
            label="Multiline"
            initialValue={"Compare the current plan with the implementation.\nCall out the important differences.\nSuggest the smallest next step."}
          />
          <ComposerFixture label="Running" initialValue="Continue the analysis" running />
          <ComposerFixture label="Disabled" initialValue="This composer is unavailable." disabled />
          <ComposerFixture
            label="With Actions"
            initialValue="Ask with additional context"
            actions={(
              <>
                <Button type="button" variant="ghost" size="sm">Attach</Button>
                <Button type="button" variant="ghost" size="sm">Context</Button>
              </>
            )}
          />
          <ComposerSuggestionsFixture theme={theme} />
        </div>
      </section>

      <section className={styles.section}>
        <h2>Overlays</h2>
        <div className={styles.row}>
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Open dialog</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Configure agent</DialogTitle>
                <DialogDescription>
                  Dialog behavior, focus, and portal ownership come from Base UI.
                </DialogDescription>
              </DialogHeader>
              <div className={styles.dialogBody}>
                <Label>Agent name</Label>
                <Input defaultValue="Research assistant" />
              </div>
              <DialogFooter>
                <DialogClose>Cancel</DialogClose>
                <Button>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="sm" />} delay={0}>
              Focus or hover
            </TooltipTrigger>
            <TooltipContent>Root-scoped tooltip content</TooltipContent>
          </Tooltip>

          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>Open popover</PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Run details</PopoverTitle>
                <PopoverDescription>
                  This popup is positioned by Base UI inside AgentUIRoot.
                </PopoverDescription>
              </PopoverHeader>
              <PopoverClose>Done</PopoverClose>
            </PopoverContent>
          </Popover>

          <span className={styles.spinnerSample}><Spinner aria-label="Loading" /> Loading</span>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Workbench primitives</h2>
        <div className={styles.workbench}>
          <div className={styles.workbenchHeader}>
            <div className={styles.agentIdentity}>
              <Avatar size="sm">
                <AvatarFallback>AR</AvatarFallback>
                <AvatarBadge aria-label="Agent running" />
              </Avatar>
              <div>
                <strong>Agent workspace</strong>
                <span>Interaction primitives</span>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
                Actions
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Agent</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    Rename
                    <DropdownMenuShortcut>↵</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem defaultChecked>
                  Show tool details
                </DropdownMenuCheckboxItem>
                <DropdownMenuRadioGroup defaultValue="compact">
                  <DropdownMenuRadioItem value="compact">Compact density</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="comfortable">Comfortable density</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem>Research</DropdownMenuItem>
                    <DropdownMenuItem>Archive</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="danger">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Tabs defaultValue="chat">
            <TabsList>
              <TabsTrigger value="chat">Chat</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="disabled" disabled>Disabled</TabsTrigger>
            </TabsList>
            <TabsContent value="chat">
              <ScrollArea className={styles.workbenchScroll}>
                <div className={styles.timeline}>
                  <div className={styles.timelineRow}>
                    <Avatar>
                      <AvatarFallback>AI</AvatarFallback>
                      <AvatarBadge className={styles.runningBadge} />
                    </Avatar>
                    <div className={styles.timelineBody}>
                      <div className={styles.timelineTitle}>
                        <strong>Research agent</strong>
                        <Badge variant="success">Ready</Badge>
                      </div>
                      <span>Workbench primitives are available as local source.</span>
                    </div>
                  </div>
                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className={styles.disclosureTrigger}>
                      <span aria-hidden="true">⌄</span> Tool details
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className={styles.toolDetails}>
                        <code>inspect_agent_ui_sources</code>
                        <Badge variant="info">Managed</Badge>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className={styles.settingRow}>
                    <Label htmlFor={`${theme}-tools-switch`}>Enable frontend tools</Label>
                    <Switch id={`${theme}-tools-switch`} defaultChecked />
                  </div>
                  <div className={styles.badgeRow}>
                    <Badge>Beta</Badge>
                    <Badge variant="secondary">Queued</Badge>
                    <Badge variant="outline">3 items</Badge>
                    <Badge variant="warning">Needs input</Badge>
                    <Badge variant="danger">Error</Badge>
                  </div>
                  <div className={styles.skeletonGroup}>
                    <Skeleton className={styles.skeletonTitle} />
                    <Skeleton className={styles.skeletonLine} />
                    <Skeleton className={styles.skeletonShort} />
                  </div>
                  {Array.from({ length: 5 }, (_, index) => (
                    <div className={styles.resourceRow} key={index}>
                      <span>Resource {index + 1}</span>
                      <Badge variant="outline">Source</Badge>
                    </div>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </TabsContent>
            <TabsContent value="files">Files panel</TabsContent>
            <TabsContent value="tools">Tools panel</TabsContent>
            <TabsContent value="disabled">Disabled panel</TabsContent>
          </Tabs>
        </div>
      </section>
    </AgentUIRoot>
  );
}

export function AgentUIPrimitiveGallery() {
  return (
    <main className={styles.page}>
      <ThemeGallery theme="light" />
      <ThemeGallery theme="dark" />
    </main>
  );
}
