import { useEffect, useRef, useState } from "react";

export interface ToolDisclosureOptions {
  toolCallId: string;
  defaultExpanded: boolean;
}

export interface ToolDisclosureBinding {
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
}

/**
 * Owns the disclosure state of one tool occurrence.
 *
 * `defaultExpanded` only seeds the state. The caller's later choice is never
 * overwritten by status updates or by a new `defaultExpanded` value on the same
 * tool call; only a different `toolCallId` seeds a fresh state.
 */
export function useToolDisclosure({
  toolCallId,
  defaultExpanded,
}: ToolDisclosureOptions): ToolDisclosureBinding {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const previousToolCallIdRef = useRef(toolCallId);

  useEffect(() => {
    if (previousToolCallIdRef.current === toolCallId) {
      return;
    }

    previousToolCallIdRef.current = toolCallId;
    setExpanded(defaultExpanded);
  }, [defaultExpanded, toolCallId]);

  return {
    expanded,
    onExpandedChange: setExpanded,
  };
}
