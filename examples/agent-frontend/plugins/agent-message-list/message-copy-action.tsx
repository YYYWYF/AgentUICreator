import { useEffect, useRef, useState } from "react";

import { Button } from "../../agent-ui/primitives/button";

export interface MessageCopyActionProps {
  text: string;
}

type CopyState = "idle" | "copied" | "error";

const copyLabels: Record<CopyState, string> = {
  idle: "复制",
  copied: "已复制",
  error: "复制失败",
};

export function MessageCopyAction({ text }: MessageCopyActionProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timerRef = useRef<number | undefined>(undefined);

  const scheduleReset = () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = undefined;
      setState("idle");
    }, 1_500);
  };

  const handleCopy = async () => {
    try {
      if (
        typeof navigator === "undefined" ||
        navigator.clipboard === undefined
      ) {
        throw new Error("Clipboard API unavailable");
      }

      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }

    scheduleReset();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <Button
      className="agent-message-list-actions"
      data-slot="agent-message-copy-action"
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleCopy}
    >
      {copyLabels[state]}
    </Button>
  );
}
