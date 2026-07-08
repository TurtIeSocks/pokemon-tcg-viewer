import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Stagger({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("stagger", className)} {...props} />;
}

export function Sheen() {
	return (
		<span
			aria-hidden="true"
			className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-(--ease) group-hover:translate-x-full motion-reduce:hidden"
		/>
	);
}
