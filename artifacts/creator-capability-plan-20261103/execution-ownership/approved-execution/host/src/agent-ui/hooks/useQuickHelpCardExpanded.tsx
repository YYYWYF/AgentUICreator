import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

/**
 * Controller shared between the Quick Help Card and the Plugins composed into
 * its `headerActions` slot, so header actions can collapse the card body.
 */
export type QuickHelpCardExpandedController = {
  expanded: boolean;
  bodyId: string;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
};

const QuickHelpCardExpandedContext = createContext<QuickHelpCardExpandedController | null>(null);

export function useQuickHelpCardExpanded(): QuickHelpCardExpandedController | null {
  return useContext(QuickHelpCardExpandedContext);
}

type QuickHelpCardExpandedProviderProps = {
  expanded: boolean;
  bodyId: string;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
  children?: ReactNode;
};

export function QuickHelpCardExpandedProvider(props: QuickHelpCardExpandedProviderProps) {
  const { expanded, bodyId, collapse, expand, toggle, children } = props;
  const value = useMemo(
    () => ({ expanded, bodyId, collapse, expand, toggle }),
    [expanded, bodyId, collapse, expand, toggle],
  );

  return (
    <QuickHelpCardExpandedContext.Provider value={value}>
      {children}
    </QuickHelpCardExpandedContext.Provider>
  );
}
