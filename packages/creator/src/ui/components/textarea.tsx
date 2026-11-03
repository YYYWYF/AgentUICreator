// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
import * as React from "react"
import { cn } from "./utils.js"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "cui:flex cui:field-sizing-content cui:min-h-16 cui:w-full cui:rounded-md cui:border cui:border-input cui:bg-transparent cui:px-3 cui:py-2 cui:text-base cui:shadow-xs cui:transition-[color,box-shadow] cui:outline-none cui:placeholder:text-muted-foreground cui:focus-visible:border-ring cui:focus-visible:ring-[3px] cui:focus-visible:ring-ring/50 cui:disabled:cursor-not-allowed cui:disabled:opacity-50 cui:aria-invalid:border-destructive cui:aria-invalid:ring-destructive/20 cui:md:text-sm cui:dark:bg-input/30 cui:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
