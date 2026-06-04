import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[var(--r-control)] border border-[var(--border)] bg-white/[0.04] px-3 py-2 text-base text-[var(--ink)] shadow-xs transition-[color,box-shadow] outline-none placeholder:text-[var(--faint)] focus-visible:border-[var(--primary)] focus-visible:ring-[3px] focus-visible:ring-[var(--primary-wash)] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
