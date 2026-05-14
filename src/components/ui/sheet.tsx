import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: "right" | "left";
  size?: "sm" | "md" | "lg";
}

const SIZE_MAP = {
  sm: "w-[380px]",
  md: "w-[520px]",
  lg: "w-[640px]",
} as const;

export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ className, children, side = "right", size = "md", ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed top-0 z-50 flex h-full flex-col gap-4 border-l border-border bg-surface shadow-[var(--shadow-lg)]",
        "data-[state=open]:animate-in data-[state=open]:duration-200",
        "data-[state=closed]:animate-out data-[state=closed]:duration-200",
        side === "right"
          ? "right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
          : "left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        SIZE_MAP[size],
        "max-w-[100vw]",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        aria-label="Fechar"
        className="absolute top-4 right-4 rounded-[var(--radius-sm)] p-1 text-text-muted opacity-70 transition hover:bg-surface-2 hover:opacity-100 focus:ring-2 focus:ring-[var(--color-accent-ring)] focus:outline-none"
      >
        <X className="size-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1 border-b border-border px-6 py-5 pr-12", className)}
    {...props}
  />
);

export const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-lg font-semibold tracking-tight text-text", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-text-muted", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export const SheetBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 overflow-y-auto px-6 py-4", className)} {...props} />
);

export const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex items-center justify-end gap-2 border-t border-border bg-surface-2/30 px-6 py-4",
      className,
    )}
    {...props}
  />
);
