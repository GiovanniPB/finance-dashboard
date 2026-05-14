import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] text-sm font-medium whitespace-nowrap transition-all duration-[var(--duration-fast)] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-foreground shadow-[var(--shadow-sm)] hover:bg-accent-hover hover:shadow-[var(--shadow-accent)]",
        secondary:
          "border border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-3",
        ghost: "text-text-muted hover:bg-surface-2 hover:text-text",
        outline:
          "border border-border bg-transparent text-text hover:border-border-strong hover:bg-surface-2",
        danger: "bg-expense text-white hover:opacity-90",
        link: "h-auto px-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
