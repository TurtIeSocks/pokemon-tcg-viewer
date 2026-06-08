import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { getAvatarPreset, initialsFrom } from "./avatar-presets";

/** Props for {@link CollectorAvatar}. */
interface CollectorAvatarProps {
	/** Drives the initials + accessible label. */
	displayName: string;
	/** Avatar preset id; unknown ids fall back to the default gradient. */
	preset: string;
	className?: string;
}

/** A round, gradient-filled avatar showing the collector's initials. */
export function CollectorAvatar({
	displayName,
	preset,
	className,
}: CollectorAvatarProps) {
	const { gradient } = getAvatarPreset(preset);
	const initials = initialsFrom(displayName);
	return (
		<Avatar
			aria-label={displayName}
			className={cn(
				"flex shrink-0 items-center justify-center rounded-lg font-display font-semibold text-white",
				className,
			)}
			style={{ background: gradient }}
		>
			{initials}
		</Avatar>
	);
}
