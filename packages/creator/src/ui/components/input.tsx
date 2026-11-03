// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
import * as React from "react"
import { cn } from "./utils.js"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "cui:h-9 cui:w-full cui:min-w-0 cui:rounded-md cui:border cui:border-input cui:bg-transparent cui:px-3 cui:py-1 cui:text-base cui:shadow-xs cui:transition-[color,box-shadow] cui:outline-none cui:selection:bg-primary cui:selection:text-primary-foreground cui:file:inline-flex cui:file:h-7 cui:file:border-0 cui:file:bg-transparent cui:file:text-sm cui:file:font-medium cui:file:text-foreground cui:placeholder:text-muted-foreground cui:disabled:pointer-events-none cui:disabled:cursor-not-allowed cui:disabled:opacity-50 cui:md:text-sm cui:dark:bg-input/30",
        "cui:focus-visible:border-ring cui:focus-visible:ring-[3px] cui:focus-visible:ring-ring/50",
        "cui:aria-invalid:border-destructive cui:aria-invalid:ring-destructive/20 cui:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
