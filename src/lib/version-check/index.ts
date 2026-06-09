export {
	type UseVersionAvailableOptions,
	type VersionAvailable,
	useVersionAvailable,
} from "./use-version-available";
export { type VersionToastProps, VersionToast } from "./version-toast";

// NOTE: the Vite plugin is intentionally NOT re-exported here — it imports
// node:child_process and must never enter the client graph. Import it directly
// from "./vite-plugin-version" in vite.config.ts.
