import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-(--r-pill) text-sm font-medium whitespace-nowrap transition-[transform,background-color,box-shadow] outline-none active:scale-[0.975] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-(--primary) text-(--primary-ink) hover:bg-(--primary-strong) shadow-[0_10px_26px_-10px_var(--primary)]",
        destructive: "bg-(--danger) text-white hover:opacity-90",
        outline:
          "border border-(--border) bg-transparent hover:bg-white/5 text-(--ink)",
        secondary:
          "bg-(--glass) text-(--ink) hover:bg-white/9 border border-(--border)",
        ghost:
          "bg-white/5 text-(--ink) border border-(--border) hover:bg-white/9",
        link: "text-(--primary) underline-offset-4 hover:underline",
        soft: "bg-(--primary-wash) text-(--primary) hover:bg-[color-mix(in_oklch,var(--primary)_28%,transparent)]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-(--r-pill) px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-(--r-pill) px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-(--r-pill) px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-(--r-pill) [&_svg:not([class*='size-'])]:size-3",
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
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
