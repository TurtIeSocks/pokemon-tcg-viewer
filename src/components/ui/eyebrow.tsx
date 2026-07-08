import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ className, ...props }: ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"inline-block rounded-full border border-(--border) bg-(--primary-wash) px-[11px] py-[5px] text-[10.5px] font-semibold uppercase tracking-[0.22em] text-(--primary)",
				className,
			)}
			{...props}
		/>
	);
}
