// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "./utils.js"

const alertVariants = cva(
  "cui:relative cui:grid cui:w-full cui:grid-cols-[0_1fr] cui:items-start cui:gap-y-0.5 cui:rounded-lg cui:border cui:px-4 cui:py-3 cui:text-sm cui:has-[>svg]:grid-cols-[calc(var(--cui-spacing)*4)_1fr] cui:has-[>svg]:gap-x-3 cui:[&>svg]:size-4 cui:[&>svg]:translate-y-0.5 cui:[&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "cui:bg-card cui:text-card-foreground",
        destructive:
          "cui:bg-card cui:text-destructive cui:*:data-[slot=alert-description]:text-destructive/90 cui:[&>svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "cui:col-start-2 cui:line-clamp-1 cui:min-h-4 cui:font-medium cui:tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "cui:col-start-2 cui:grid cui:justify-items-start cui:gap-1 cui:text-sm cui:text-muted-foreground cui:[&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
