import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary-wash)] text-[var(--primary)] border-transparent",
        secondary:
          "bg-[var(--glass)] text-[var(--ink-muted)]",
        destructive:
          "bg-[color-mix(in_oklch,var(--danger)_18%,transparent)] text-[var(--danger)]",
        outline:
          "border-[var(--border)] text-[var(--ink-muted)]",
        success:
          "bg-[color-mix(in_oklch,var(--success)_18%,transparent)] text-[var(--success)]",
        warning:
          "bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] text-[var(--warning)]",
        ghost: "[a&]:hover:bg-white/[0.09]",
        link: "text-[var(--primary)] underline-offset-4 [a&]:hover:underline",
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
  const Comp = asChild ? Slot.Root : "span"

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
