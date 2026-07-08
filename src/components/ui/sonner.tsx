import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Dark-only sonner Toaster themed to the Liquid-Glass tokens. No next-themes —
 * the app has a single dark canvas. `--normal-*` are sonner's own theming vars;
 * none are self-referential (which would hang happy-dom).
 */
export function Toaster(props: ToasterProps) {
	return (
		<Sonner
			theme="dark"
			position="bottom-right"
			className="toaster group"
			style={
				{
					"--normal-bg": "var(--glass)",
					"--normal-text": "var(--ink)",
					"--normal-border": "rgba(255,255,255,0.1)",
				} as CSSProperties
			}
			toastOptions={{
				classNames: {
					toast:
						"group border border-white/10 bg-(--glass) backdrop-blur-xl text-(--ink) shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)]",
					description: "text-(--ink-muted)",
					// `!` overrides sonner's own [data-button] rule (higher specificity).
					actionButton:
						"bg-(--primary)! text-(--primary-ink)! rounded-(--r-pill)! font-semibold!",
					cancelButton: "bg-(--glass)! text-(--ink-muted)!",
				},
			}}
			{...props}
		/>
	);
}
