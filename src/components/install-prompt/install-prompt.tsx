import { useEffect, useState } from "react";
import "./install-prompt.css";

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
		null,
	);

	useEffect(() => {
		const onBeforeInstall = (e: Event) => {
			e.preventDefault();
			setDeferred(e as BeforeInstallPromptEvent);
		};
		window.addEventListener("beforeinstallprompt", onBeforeInstall);
		return () =>
			window.removeEventListener("beforeinstallprompt", onBeforeInstall);
	}, []);

	if (!deferred) return null;

	return (
		<button
			type="button"
			className="install-prompt-button"
			onClick={async () => {
				await deferred.prompt();
				setDeferred(null);
			}}
		>
			Install app
		</button>
	);
}
