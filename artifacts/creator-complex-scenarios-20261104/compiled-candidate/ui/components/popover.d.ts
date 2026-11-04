import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
declare function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>): React.JSX.Element;
declare function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>): React.JSX.Element;
declare function PopoverContent({ className, align, sideOffset, container, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content> & {
    container: HTMLElement | null;
}): React.JSX.Element | null;
declare function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>): React.JSX.Element;
declare function PopoverHeader({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">): React.JSX.Element;
declare function PopoverDescription({ className, ...props }: React.ComponentProps<"p">): React.JSX.Element;
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverHeader, PopoverTitle, PopoverDescription, };
//# sourceMappingURL=popover.d.ts.map