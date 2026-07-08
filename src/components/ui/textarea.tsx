import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-(--r-control) border border-(--border) bg-white/4 px-3 py-2 text-base text-(--ink) shadow-xs transition-[color,box-shadow] outline-none placeholder:text-(--faint) focus-visible:border-(--primary) focus-visible:ring-[3px] focus-visible:ring-(--primary-wash) disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
