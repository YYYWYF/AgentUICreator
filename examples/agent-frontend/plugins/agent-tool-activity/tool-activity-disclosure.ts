import { useEffect, useRef, useState } from "react";

export interface ToolActivityDisclosureOptions {
  activityId: string;
}

export interface ToolActivityDisclosureBinding {
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
}

/** Owns disclosure for one projected Tool Activity occurrence. */
export function useToolActivityDisclosure({
  activityId,
}: ToolActivityDisclosureOptions): ToolActivityDisclosureBinding {
  const [expanded, setExpanded] = useState(false);
  const previousActivityIdRef = useRef(activityId);

  useEffect(() => {
    if (previousActivityIdRef.current === activityId) {
      return;
    }

    previousActivityIdRef.current = activityId;
    setExpanded(false);
  }, [activityId]);

  return {
    expanded,
    onExpandedChange: setExpanded,
  };
}
