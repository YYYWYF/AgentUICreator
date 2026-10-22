// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
"use client"

import * as React from "react"
import { cn } from "./utils.js"
import * as PopoverPrimitive from "@radix-ui/react-popover"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 6,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & { container: HTMLElement | null }) {
  if (!container) return null;
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "cui:z-50 cui:w-72 cui:origin-(--radix-popover-content-transform-origin) cui:rounded-md cui:border cui:bg-popover cui:p-4 cui:text-popover-foreground cui:shadow-md cui:outline-hidden cui:data-[side=bottom]:slide-in-from-top-2 cui:data-[side=left]:slide-in-from-right-2 cui:data-[side=right]:slide-in-from-left-2 cui:data-[side=top]:slide-in-from-bottom-2 cui:data-[state=closed]:animate-out cui:data-[state=closed]:fade-out-0 cui:data-[state=closed]:zoom-out-95 cui:data-[state=open]:animate-in cui:data-[state=open]:fade-in-0 cui:data-[state=open]:zoom-in-95",
          "creator-ui-scope",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("cui:flex cui:flex-col cui:gap-1 cui:text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("cui:font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("cui:text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
