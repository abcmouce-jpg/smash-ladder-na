"use client";

import * as React from "react";
import { Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { useIsTouchDevice } from "@/hooks/use-is-touch-device";

const TOOLTIP_CONTENT_CLASSNAME =
  "z-50 max-w-64 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md";
const TOOLTIP_CONTENT_ANIMATION_CLASSNAME =
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2";

// Radix Tooltip deliberately ignores touch input (hover-open is skipped for
// touch pointers, and its trigger's click handler always force-closes), so
// hover tooltips are unreachable on mobile. Popover implements tap-to-toggle
// and tap-outside-to-dismiss as its default behavior, so on coarse pointers we
// render the Popover primitives instead, styled identically.
//
// Tooltip/TooltipTrigger/TooltipContent must agree on which primitive family
// (Tooltip vs Popover) is in play. Each independently calling
// useIsTouchDevice() is unsafe: they're separate useSyncExternalStore
// subscriptions that can flip to the "true" client value on different
// renders, briefly mounting e.g. PopoverTrigger under a TooltipPrimitive.Root
// (or vice versa) and crashing. Computing it once here and passing it down
// via context guarantees every consumer sees the same value in the same
// render.
const TooltipDeviceContext = React.createContext(false);

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const isTouch = useIsTouchDevice();

  if (isTouch) {
    return (
      <TooltipDeviceContext.Provider value={isTouch}>
        <PopoverPrimitive.Root data-slot="tooltip" {...props} />
      </TooltipDeviceContext.Provider>
    );
  }

  return (
    <TooltipDeviceContext.Provider value={isTouch}>
      <TooltipPrimitive.Provider delayDuration={200}>
        <TooltipPrimitive.Root data-slot="tooltip" {...props} />
      </TooltipPrimitive.Provider>
    </TooltipDeviceContext.Provider>
  );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const isTouch = React.useContext(TooltipDeviceContext);

  if (isTouch) {
    return <PopoverPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
  }

  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const isTouch = React.useContext(TooltipDeviceContext);

  if (isTouch) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          data-slot="tooltip-content"
          sideOffset={sideOffset}
          onOpenAutoFocus={(event) => event.preventDefault()}
          className={cn(
            TOOLTIP_CONTENT_CLASSNAME,
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            TOOLTIP_CONTENT_ANIMATION_CLASSNAME,
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Portal>
    );
  }

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          TOOLTIP_CONTENT_CLASSNAME,
          "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95",
          TOOLTIP_CONTENT_ANIMATION_CLASSNAME,
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent };
