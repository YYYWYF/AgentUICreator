'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  LoaderCircle,
  Search,
  Sparkles,
} from 'lucide-react';
import { Popover } from '@base-ui/react/popover';
import type { ConversationComposerRunConfig } from '@za38.03/agent-ui-runtime/plugin-api';
import {
  useAgentUIPortalContainer,
  useAgentUILocale,
} from '../../../../public.js';

interface SkillEntry {
  /** Stable application/backend identity; labels are presentation only. */
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}
export interface ConversationSkill extends SkillEntry {
  kind: 'skill';
  /** Application-owned request fields, forwarded by the canonical Composer. */
  runConfig?: ConversationComposerRunConfig;
}
export interface ConversationWorkflow extends SkillEntry {
  kind: 'workflow';
  /** Only invoked by an explicit click on Start. */
  onStart: () => void | Promise<void>;
}
export type ConversationSkillItem = ConversationSkill | ConversationWorkflow;
export interface ConversationSkillsProps
  extends Omit<ComponentProps<'div'>, 'children'> {
  items?: readonly ConversationSkillItem[];
  selectedSkillId?: string | null;
  defaultSelectedSkillId?: string | null;
  onSelectedSkillChange?: (skill: ConversationSkill | null) => void;
  quickItemCount?: number;
  disabled?: boolean;
  /** Change with the active thread/account to reset local selection and pending UI. */
  scopeKey?: string;
}

const EMPTY_ITEMS: readonly ConversationSkillItem[] = [];

export function ConversationSkills({
  scopeKey,
  ...props
}: ConversationSkillsProps) {
  return <SkillsContent key={scopeKey} {...props} />;
}

function SkillsContent({
  items = EMPTY_ITEMS,
  selectedSkillId,
  defaultSelectedSkillId = null,
  onSelectedSkillChange,
  quickItemCount = 2,
  disabled = false,
  ...rootProps
}: Omit<ConversationSkillsProps, 'scopeKey'>) {
  const labels = useAgentUILocale('skills');
  const portalContainer = useAgentUIPortalContainer();
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  // Stay inside the current conversation's stacking and clipping boundary,
  // including a floating or embedded shell. Never portal to the page body.
  const surfaceBoundary =
    rootElement?.closest<HTMLElement>('[data-agent-ui-conversation]') ??
    rootElement?.closest<HTMLElement>('[data-agent-ui-root]') ??
    portalContainer?.parentElement;
  const titleId = useId();
  const hintId = useId();
  const [localId, setLocalId] = useState(defaultSelectedSkillId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const running = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id = selectedSkillId === undefined ? localId : selectedSkillId;
  const selected = items.find(
    (item): item is ConversationSkill =>
      item.kind === 'skill' && item.id === id && !item.disabled,
  );
  useEffect(() => {
    if (selectedSkillId === undefined && localId !== null && !selected)
      setLocalId(null);
  }, [selectedSkillId, localId, selected]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function choose(skill: ConversationSkill | null) {
    if (disabled || skill?.disabled) return;
    if (selectedSkillId === undefined) setLocalId(skill?.id ?? null);
    onSelectedSkillChange?.(skill);
    setOpen(false);
    setQuery('');
  }
  async function start(workflow: ConversationWorkflow) {
    if (disabled || workflow.disabled || running.current) return;
    running.current = true;
    setPendingId(workflow.id);
    setError(false);
    try {
      await workflow.onStart();
      if (mounted.current) {
        setOpen(false);
        setQuery('');
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      running.current = false;
      if (mounted.current) setPendingId(null);
    }
  }
  const skills = items.filter(
    (item): item is ConversationSkill => item.kind === 'skill',
  );
  const quick = skills.slice(
    0,
    Math.max(
      0,
      Math.floor(Number.isFinite(quickItemCount) ? quickItemCount : 2),
    ),
  );
  const needle = query.trim().toLocaleLowerCase();
  const filtered = items.filter((item) =>
    `${item.label} ${item.description ?? ''}`
      .toLocaleLowerCase()
      .includes(needle),
  );
  return (
    <div
      {...rootProps}
      ref={setRootElement}
      data-ui-plugin="skills"
      data-agent-ui-owned=""
      className={['skills-plugin', rootProps.className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="skills-bar" role="group" aria-label={labels.title}>
        {quick.map((skill) => (
          <button
            key={skill.id}
            type="button"
            className="skills-pill"
            aria-pressed={selected?.id === skill.id}
            disabled={disabled || skill.disabled}
            onClick={() => choose(selected?.id === skill.id ? null : skill)}
            title={skill.description}
          >
            {skill.icon ?? <Sparkles aria-hidden="true" />}
            <span>{skill.label}</span>
            {selected?.id === skill.id && <Check aria-hidden="true" />}
          </button>
        ))}
        <Popover.Root
          open={open}
          onOpenChange={(next) => {
            setOpen(!disabled && next);
            if (!next) setQuery('');
          }}
        >
          <Popover.Trigger
            type="button"
            className="skills-pill skills-more"
            disabled={disabled}
          >
            {labels.more}
            <ChevronDown aria-hidden="true" />
          </Popover.Trigger>
          {rootElement && (
            <Popover.Portal container={rootElement}>
              <Popover.Positioner
                positionMethod="fixed"
                {...(surfaceBoundary ? { collisionBoundary: surfaceBoundary } : {})}
                collisionPadding={8}
                side="top"
                align="end"
                sideOffset={10}
                collisionAvoidance={{
                  side: 'none',
                  align: 'shift',
                  fallbackAxisSide: 'none',
                }}
                className="skills-positioner"
              >
                <Popover.Popup
                  className="skills-popover"
                  aria-labelledby={titleId}
                  aria-describedby={hintId}
                >
                  <Popover.Title id={titleId} className="skills-popover-title">
                    {labels.title}
                  </Popover.Title>
                  <label className="skills-search">
                    <Search aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={labels.search}
                      aria-label={labels.search}
                    />
                  </label>
                  <div className="skills-results">
                    {(['skill', 'workflow'] as const).map((kind) => {
                      const group = filtered.filter(
                        (item) => item.kind === kind,
                      );
                      return group.length === 0 ? null : (
                        <section
                          className="skills-group"
                          key={kind}
                          aria-label={
                            kind === 'skill' ? labels.skills : labels.workflows
                          }
                        >
                          <h4>
                            {kind === 'skill'
                              ? labels.skills
                              : labels.workflows}
                          </h4>
                          {group.map((item) =>
                            item.kind === 'skill' ? (
                              <button
                                key={item.id}
                                type="button"
                                className="skills-item skills-item-select"
                                aria-pressed={selected?.id === item.id}
                                disabled={disabled || item.disabled}
                                onClick={() =>
                                  choose(selected?.id === item.id ? null : item)
                                }
                              >
                                <span className="skills-item-icon">
                                  {item.icon ?? <Sparkles aria-hidden="true" />}
                                </span>
                                <span className="skills-item-copy">
                                  <strong>{item.label}</strong>
                                  {item.description && (
                                    <span>{item.description}</span>
                                  )}
                                </span>
                                {selected?.id === item.id && (
                                  <Check aria-hidden="true" />
                                )}
                              </button>
                            ) : (
                              <div key={item.id} className="skills-item">
                                <span className="skills-item-icon">
                                  {item.icon ?? (
                                    <ArrowRight aria-hidden="true" />
                                  )}
                                </span>
                                <span className="skills-item-copy">
                                  <strong>{item.label}</strong>
                                  {item.description && (
                                    <span>{item.description}</span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="skills-start"
                                  disabled={
                                    disabled ||
                                    item.disabled ||
                                    pendingId !== null
                                  }
                                  aria-label={`${labels.start}: ${item.label}`}
                                  onClick={() => {
                                    void start(item);
                                  }}
                                >
                                  {pendingId === item.id ? (
                                    <>
                                      <LoaderCircle
                                        className="skills-spinner"
                                        aria-hidden="true"
                                      />
                                      {labels.starting}
                                    </>
                                  ) : (
                                    labels.start
                                  )}
                                </button>
                              </div>
                            ),
                          )}
                        </section>
                      );
                    })}
                    {filtered.length === 0 && (
                      <p className="skills-empty" role="status">
                        {items.length === 0 ? labels.unavailable : labels.empty}
                      </p>
                    )}
                  </div>
                  {error && (
                    <p className="skills-error" role="alert">
                      {labels.startFailed}
                    </p>
                  )}
                  <Popover.Description className="skills-hint" id={hintId}>
                    {labels.hint}
                  </Popover.Description>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          )}
        </Popover.Root>
      </div>
    </div>
  );
}
