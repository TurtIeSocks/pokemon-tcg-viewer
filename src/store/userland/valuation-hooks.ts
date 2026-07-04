import { useUserland } from "./userland-store";

/** True when the collector has hidden all monetary surfaces (Profile.hideValue). */
export function useHideValue(): boolean {
	return useUserland((s) => s.profile?.hideValue ?? false);
}
