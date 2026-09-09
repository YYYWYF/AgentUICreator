import { AgentUIRoot, type AgentUITheme } from "../../agent-ui/foundation/AgentUIRoot";
import { Button } from "../../agent-ui/primitives/button";
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
import { Spinner } from "../../agent-ui/primitives/spinner";
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

function ThemeGallery({ theme }: { theme: AgentUITheme }) {
  const inputId = `${theme}-gallery-input`;

  return (
    <AgentUIRoot theme={theme} className={styles.theme}>
      <header className={styles.themeHeader}>
        <div>
          <p className={styles.eyebrow}>Agent UI Foundation 0.2.0</p>
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
        <h2>Overlays</h2>
        <div className={styles.row}>
          <Dialog>
            <DialogTrigger>Open dialog</DialogTrigger>
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
            <TooltipTrigger delay={0}>Focus or hover</TooltipTrigger>
            <TooltipContent>Root-scoped tooltip content</TooltipContent>
          </Tooltip>

          <Popover>
            <PopoverTrigger>Open popover</PopoverTrigger>
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
