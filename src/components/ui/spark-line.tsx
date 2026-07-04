/**
 * Dependency-free SVG line chart. Plots a series of `[x, y]` points scaled to
 * fit the viewport, x spread by index and y scaled to the data's own
 * min/max (inverted — SVG y grows downward, so a higher value renders at a
 * smaller y / higher on screen).
 *
 * Renders no polyline for fewer than 2 plottable points (a single point
 * can't draw a line). `null` y-values are filtered out before scaling.
 */
export function SparkLine({
	points,
	width = 120,
	height = 40,
	pad = 4,
	label,
}: {
	points: [number, number | null][];
	width?: number;
	height?: number;
	pad?: number;
	label?: string;
}) {
	const plotted = points.filter(
		(point): point is [number, number] => point[1] !== null,
	);

	if (plotted.length < 2) {
		return (
			<svg
				width={width}
				height={height}
				viewBox={`0 0 ${width} ${height}`}
				aria-hidden="true"
			/>
		);
	}

	const values = plotted.map(([, v]) => v);
	const yMin = Math.min(...values);
	const yMax = Math.max(...values);
	const span = yMax - yMin;
	const innerHeight = height - 2 * pad;
	const stepX = plotted.length > 1 ? (width - 2 * pad) / (plotted.length - 1) : 0;

	const scaleY = (v: number) =>
		span === 0
			? pad + innerHeight / 2
			: pad + (1 - (v - yMin) / span) * innerHeight;

	const coords = plotted.map(([, v], i) => {
		const x = pad + i * stepX;
		const y = scaleY(v);
		return [x, y] as const;
	});

	const pointsAttr = coords.map(([x, y]) => `${x},${y}`).join(" ");
	const areaAttr = `${pad},${height - pad} ${pointsAttr} ${width - pad},${height - pad}`;

	return (
		<svg
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			aria-hidden="true"
			role="presentation"
		>
			{label ? <title>{label}</title> : null}
			<polygon points={areaAttr} className="fill-[var(--primary)]/10" />
			<polyline
				points={pointsAttr}
				fill="none"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="stroke-[var(--primary)] transition-[stroke] duration-300 ease-out motion-reduce:transition-none"
			/>
		</svg>
	);
}
