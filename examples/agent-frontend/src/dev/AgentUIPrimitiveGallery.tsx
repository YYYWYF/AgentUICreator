import { useState, type ReactNode } from "react";

import { AgentComposer } from "../../agent-ui/components/composer";
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
