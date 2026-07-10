import { useSyncExternalStore } from "react";

function subscribe(cb: () => void): () => void {
	window.addEventListener("online", cb);
	window.addEventListener("offline", cb);
	return () => {
		window.removeEventListener("online", cb);
		window.removeEventListener("offline", cb);
	};
}

const getSnapshot = () => navigator.onLine;
// Assume online during SSR (no navigator); the client corrects on hydration.
const getServerSnapshot = () => true;

/** True when the browser reports a network connection (reactive to online/offline). */
export function useOnlineStatus(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
