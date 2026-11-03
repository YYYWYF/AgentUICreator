// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "./utils.js"
import * as Slot from "@radix-ui/react-slot"

const buttonVariants = cva(
  "cui:inline-flex cui:shrink-0 cui:items-center cui:justify-center cui:gap-2 cui:rounded-md cui:text-sm cui:font-medium cui:whitespace-nowrap cui:transition-all cui:outline-none cui:focus-visible:border-ring cui:focus-visible:ring-[3px] cui:focus-visible:ring-ring/50 cui:disabled:pointer-events-none cui:disabled:opacity-50 cui:aria-invalid:border-destructive cui:aria-invalid:ring-destructive/20 cui:dark:aria-invalid:ring-destructive/40 cui:[&_svg]:pointer-events-none cui:[&_svg]:shrink-0 cui:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "cui:bg-primary cui:text-primary-foreground cui:hover:bg-primary/90",
        destructive:
          "cui:bg-destructive cui:text-white cui:hover:bg-destructive/90 cui:focus-visible:ring-destructive/20 cui:dark:bg-destructive/60 cui:dark:focus-visible:ring-destructive/40",
        outline:
          "cui:border cui:bg-background cui:shadow-xs cui:hover:bg-accent cui:hover:text-accent-foreground cui:dark:border-input cui:dark:bg-input/30 cui:dark:hover:bg-input/50",
        secondary:
          "cui:bg-secondary cui:text-secondary-foreground cui:hover:bg-secondary/80",
        ghost:
          "cui:hover:bg-accent cui:hover:text-accent-foreground cui:dark:hover:bg-accent/50",
        link: "cui:text-primary cui:underline-offset-4 cui:hover:underline",
      },
      size: {
        default: "cui:h-9 cui:px-4 cui:py-2 cui:has-[>svg]:px-3",
        xs: "cui:h-6 cui:gap-1 cui:rounded-md cui:px-2 cui:text-xs cui:has-[>svg]:px-1.5 cui:[&_svg:not([class*='size-'])]:size-3",
        sm: "cui:h-8 cui:gap-1.5 cui:rounded-md cui:px-3 cui:has-[>svg]:px-2.5",
        lg: "cui:h-10 cui:rounded-md cui:px-6 cui:has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "cui:size-6 cui:rounded-md cui:[&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Slot : "button"

  return (
    <Comp
      data-creator-ui-button=""
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
