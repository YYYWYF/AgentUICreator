import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  collapseQuickHelpCard,
  toggleQuickHelpCardExpanded,
  useQuickHelpCardExpanded,
} from "./useQuickHelpCardExpanded";

/** Expansion controls shared by one help card and the actions in its header. */
export type HelpCardExpansion = {
  expanded: boolean;
  toggle: () => void;
  collapse: () => void;
};

const HelpCardExpansionContext = createContext<HelpCardExpansion | null>(null);

/**
 * Owns the expansion state of a single help card.
 *
 * The card title button and the actions placed in the card's `headerActions`
 * slot are separate Plugin instances, so the card hands its state down through
 * React context. Every card owns its own value: collapsing one card keeps the
 * other card untouched.
 */
export function HelpCardExpansionProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  const value = useMemo<HelpCardExpansion>(
    () => ({
      expanded,
      toggle: () => {
        setExpanded((current) => !current);
      },
      collapse: () => {
        setExpanded(false);
      },
    }),
    [expanded],
  );

  return (
    <HelpCardExpansionContext.Provider value={value}>
      {children}
    </HelpCardExpansionContext.Provider>
  );
}

/**
 * Read the expansion state of the surrounding help card. Components rendered
 * outside a card fall back to the project-wide store.
 */
export function useHelpCardExpansion(): HelpCardExpansion {
  const scoped = useContext(HelpCardExpansionContext);
  const fallbackExpanded = useQuickHelpCardExpanded();

  if (scoped) {
    return scoped;
  }

  return {
    expanded: fallbackExpanded,
    toggle: toggleQuickHelpCardExpanded,
    collapse: collapseQuickHelpCard,
  };
}
