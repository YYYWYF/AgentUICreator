import { cn } from "../../../../vendor/assistant-ui/lib/utils.js";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-agent-ui-owned=""
      data-slot="skeleton"
      className={cn("bg-muted animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
