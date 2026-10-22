// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
import * as React from "react"
import { cn } from "./utils.js"
import { ChevronDownIcon } from "lucide-react"

function NativeSelect({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <div
      className="cui:group/native-select cui:relative cui:w-fit cui:has-[select:disabled]:opacity-50"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        data-size={size}
        className={cn(
          "cui:h-9 cui:w-full cui:min-w-0 cui:appearance-none cui:rounded-md cui:border cui:border-input cui:bg-transparent cui:px-3 cui:py-2 cui:pr-9 cui:text-sm cui:shadow-xs cui:transition-[color,box-shadow] cui:outline-none cui:selection:bg-primary cui:selection:text-primary-foreground cui:placeholder:text-muted-foreground cui:disabled:pointer-events-none cui:disabled:cursor-not-allowed cui:data-[size=sm]:h-8 cui:data-[size=sm]:py-1 cui:dark:bg-input/30 cui:dark:hover:bg-input/50",
          "cui:focus-visible:border-ring cui:focus-visible:ring-[3px] cui:focus-visible:ring-ring/50",
          "cui:aria-invalid:border-destructive cui:aria-invalid:ring-destructive/20 cui:dark:aria-invalid:ring-destructive/40",
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className="cui:pointer-events-none cui:absolute cui:top-1/2 cui:right-3.5 cui:size-4 cui:-translate-y-1/2 cui:text-muted-foreground cui:opacity-50 cui:select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("cui:bg-[Canvas] cui:text-[CanvasText]", className)}
      {...props}
    />
  )
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("cui:bg-[Canvas] cui:text-[CanvasText]", className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
