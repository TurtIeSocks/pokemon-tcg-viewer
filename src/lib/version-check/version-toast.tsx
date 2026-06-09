import { useEffect, useRef } from "react";
import { toast as sonnerToast } from "sonner";
import {
	type UseVersionAvailableOptions,
	useVersionAvailable,
} from "./use-version-available";

type Notify = (
	message: string,
	data?: Parameters<typeof sonnerToast>[1],
) => unknown;

export interface VersionToastProps {
	/** Injectable for tests; defaults to sonner's `toast`. */
	notify?: Notify;
	options?: UseVersionAvailableOptions;
}

export function VersionToast({
	notify = sonnerToast,
	options,
}: VersionToastProps = {}) {
	const { updateReady, latestVersion, dismiss } = useVersionAvailable(options);
	const shown = useRef<string | null>(null);

	useEffect(() => {
		if (!updateReady || latestVersion === null) return;
		if (shown.current === latestVersion) return;
		shown.current = latestVersion;
		notify("New version available", {
			id: "app-version",
			description: "Reload to get the latest.",
			duration: Number.POSITIVE_INFINITY,
			action: { label: "Reload", onClick: () => window.location.reload() },
			onDismiss: dismiss,
		});
	}, [updateReady, latestVersion, dismiss, notify]);

	return null;
}
