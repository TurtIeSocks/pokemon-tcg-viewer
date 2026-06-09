export {
	type UseVersionAvailableOptions,
	useVersionAvailable,
	type VersionAvailable,
} from "./use-version-available";
export { VersionToast, type VersionToastProps } from "./version-toast";

// NOTE: the Vite plugin is intentionally NOT re-exported here — it imports
// node:child_process and must never enter the client graph. Import it directly
// from "./vite-plugin-version" in vite.config.ts.
