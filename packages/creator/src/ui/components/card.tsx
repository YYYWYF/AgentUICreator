// Adapted from shadcn/ui new-york-v4. See README.md for source and local changes.
import * as React from "react"
import { cn } from "./utils.js"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "cui:flex cui:flex-col cui:gap-6 cui:rounded-xl cui:border cui:bg-card cui:py-6 cui:text-card-foreground cui:shadow-sm",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "cui:@container/card-header cui:grid cui:auto-rows-min cui:grid-rows-[auto_auto] cui:items-start cui:gap-2 cui:px-6 cui:has-data-[slot=card-action]:grid-cols-[1fr_auto] cui:[.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("cui:leading-none cui:font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("cui:text-sm cui:text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "cui:col-start-2 cui:row-span-2 cui:row-start-1 cui:self-start cui:justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("cui:px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("cui:flex cui:items-center cui:px-6 cui:[.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
