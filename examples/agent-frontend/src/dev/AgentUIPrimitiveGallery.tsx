import { useRef, useState, type ReactNode } from "react";

import { AgentComposer } from "../../agent-ui/components/composer";
import {
  AgentComposerSuggestions,
  getAgentComposerSuggestionOptionId,
} from "../../agent-ui/components/composer-suggestions";
import { AgentMessage } from "../../agent-ui/components/message";
import { AgentThread } from "../../agent-ui/components/thread";
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
        onStop={running ? () => undefined : undefined}
        disabled={disabled}
        actions={actions}
      />
    </article>
  );
}

function ComposerSuggestionsFixture({ theme }: { theme: AgentUITheme }) {
  const [value, setValue] = useState("/");
  const [activeIndex, setActiveIndex] = useState(0);
  const anchor = useRef<HTMLElement>(null);
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
        <h3 className={styles.componentHeading}>Agent Thread</h3>
        <ThreadGallery />
        <h3 className={styles.componentHeading}>Agent Message</h3>
        <MessageGallery />
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
