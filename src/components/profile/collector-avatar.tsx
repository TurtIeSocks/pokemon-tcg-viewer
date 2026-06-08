// src/components/profile/collector-avatar.tsx
import { cn } from "@/lib/utils";
import { getAvatarPreset, initialsFrom } from "./avatar-presets";

/** Props for {@link CollectorAvatar}. */
interface CollectorAvatarProps {
	/** Drives the initials + accessible label. */
	displayName: string;
	/** Avatar preset id; unknown ids fall back to the default gradient. */
	preset: string;
	/** Pixel diameter. */
	size: number;
	className?: string;
}

/** A round, gradient-filled avatar showing the collector's initials. */
export function CollectorAvatar({
	displayName,
	preset,
	size,
	className,
}: CollectorAvatarProps) {
	const { gradient } = getAvatarPreset(preset);
	const initials = initialsFrom(displayName);
	return (
		<div
			role="img"
			aria-label={displayName}
			className={cn(
				"flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-white",
				className,
			)}
			style={{
				width: size,
				height: size,
				background: gradient,
				fontSize: Math.round(size * 0.4),
			}}
		>
			{initials}
		</div>
	);
}
