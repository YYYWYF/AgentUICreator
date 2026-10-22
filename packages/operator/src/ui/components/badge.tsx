// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "./utils.js"
import * as Slot from "@radix-ui/react-slot"

const badgeVariants = cva(
  "cui:inline-flex cui:w-fit cui:shrink-0 cui:items-center cui:justify-center cui:gap-1 cui:overflow-hidden cui:rounded-full cui:border cui:border-transparent cui:px-2 cui:py-0.5 cui:text-xs cui:font-medium cui:whitespace-nowrap cui:transition-[color,box-shadow] cui:focus-visible:border-ring cui:focus-visible:ring-[3px] cui:focus-visible:ring-ring/50 cui:aria-invalid:border-destructive cui:aria-invalid:ring-destructive/20 cui:dark:aria-invalid:ring-destructive/40 cui:[&>svg]:pointer-events-none cui:[&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "cui:bg-primary cui:text-primary-foreground cui:[a&]:hover:bg-primary/90",
        secondary:
          "cui:bg-secondary cui:text-secondary-foreground cui:[a&]:hover:bg-secondary/90",
        destructive:
          "cui:bg-destructive cui:text-white cui:focus-visible:ring-destructive/20 cui:dark:bg-destructive/60 cui:dark:focus-visible:ring-destructive/40 cui:[a&]:hover:bg-destructive/90",
        outline:
          "cui:border-border cui:text-foreground cui:[a&]:hover:bg-accent cui:[a&]:hover:text-accent-foreground",
        ghost: "cui:[a&]:hover:bg-accent cui:[a&]:hover:text-accent-foreground",
        link: "cui:text-primary cui:underline-offset-4 cui:[a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
