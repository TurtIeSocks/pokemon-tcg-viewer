import type { ReactNode } from "react";

/**
 * Circular completion ring. Renders a violet-stroked arc proportional to `pct`
 * over a faint track, with `children` centered inside.
 *
 * `pct` is clamped to [0, 100].
 */
export function ProgressRing({
	pct,
	size = 46,
	stroke = 4,
	children,
}: {
	pct: number;
	size?: number;
	stroke?: number;
	children?: ReactNode;
}) {
	const r = (size - stroke) / 2;
	const circ = 2 * Math.PI * r;
	const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
	return (
		<span
			className="relative inline-flex shrink-0 items-center justify-center"
			style={{ width: size, height: size }}
		>
			<svg
				width={size}
				height={size}
				className="absolute inset-0 -rotate-90"
				aria-hidden="true"
			>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					strokeWidth={stroke}
					className="stroke-white/15"
				/>
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					strokeWidth={stroke}
					strokeLinecap="round"
					strokeDasharray={circ}
					strokeDashoffset={offset}
					className="stroke-[var(--primary)] transition-[stroke-dashoffset] duration-500 ease-out"
				/>
			</svg>
			<span className="relative z-10 flex items-center justify-center">
				{children}
			</span>
		</span>
	);
}
