import { useEffect, useState } from "react";
import "./offline-indicator.css";

export function OfflineIndicator() {
	const [online, setOnline] = useState<boolean>(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);

	useEffect(() => {
		const onOnline = () => setOnline(true);
		const onOffline = () => setOnline(false);
		window.addEventListener("online", onOnline);
		window.addEventListener("offline", onOffline);
		return () => {
			window.removeEventListener("online", onOnline);
			window.removeEventListener("offline", onOffline);
		};
	}, []);

	if (online) return null;

	return (
		<span className="offline-indicator" aria-live="polite">
			Offline
		</span>
	);
}
