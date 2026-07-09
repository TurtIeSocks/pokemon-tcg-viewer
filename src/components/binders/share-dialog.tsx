"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { m } from "@/paraglide/messages";
import {
	groupByCardId,
	useBinderMembers,
	useOwnedCardIdSet,
} from "../../store/userland/selectors";
import { buildSnapshot, encodeSnapshot } from "../../store/userland/share";
import type { Binder } from "../../store/userland/types";
import { useUserland } from "../../store/userland/userland-store";

/** Props for {@link ShareDialog}. */
interface ShareDialogProps {
	/** Whether the dialog is open. */
	open: boolean;
	/** Called to request open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
	/** The binder to share. */
	binder: Binder;
}

/** URL hash-sharing dialog for a binder snapshot. */
export function ShareDialog({ open, onOpenChange, binder }: ShareDialogProps) {
	const [scope, setScope] = useState<"all" | "owned" | "needed">("all");
	const [includeGrades, setIncludeGrades] = useState(true);
	const [copied, setCopied] = useState(false);
	// Timestamp frozen at mount keeps the snapshot memo pure (no Date.now in
	// render, no setState-in-effect). Each binder detail mounts its own dialog.
	const [sharedAt] = useState(() => Date.now());

	// Resolve members via corpus + sets
	const members = useBinderMembers(binder.id);

	// Owned card id set
	const ownedCardIds = useOwnedCardIdSet();

	// Copies by card — derive from flat items map
	const items = useUserland((s) => s.items);
	const stacksByCard = useMemo(
		() => groupByCardId(Object.values(items)),
		[items],
	);

	// Build the URL — memoized on all inputs
	const url = useMemo(() => {
		if (!members) return "";
		const origin = typeof window !== "undefined" ? window.location.origin : "";
		const snapshot = buildSnapshot({
			binder,
			members,
			ownedCardIds,
			stacksByCard,
			scope,
			includeGrades,
			sharedAt,
		});
		const encoded = encodeSnapshot(snapshot);
		return `${origin}/vault/shared#b=${encoded}`;
	}, [
		binder,
		members,
		ownedCardIds,
		stacksByCard,
		scope,
		includeGrades,
		sharedAt,
	]);

	async function handleCopy() {
		if (!url) return;
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	const urlTooLong = url.length > 30000;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						{m.binder_share_dialog_title()}
					</DialogTitle>
					<DialogDescription>
						{m.binder_share_dialog_description()}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-5">
					{/* Scope control */}
					<div className="flex flex-col gap-2">
						<Label className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
							{m.binder_share_scope_label()}
						</Label>
						<RadioGroup
							value={scope}
							onValueChange={(v) => setScope(v as "all" | "owned" | "needed")}
							className="flex flex-row gap-4"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="all" id="scope-all" />
								<Label htmlFor="scope-all" className="text-(--ink)">
									{m.vault_mode_all()}
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="owned" id="scope-owned" />
								<Label htmlFor="scope-owned" className="text-(--ink)">
									{m.vault_mode_owned()}
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="needed" id="scope-needed" />
								<Label htmlFor="scope-needed" className="text-(--ink)">
									{m.binder_share_scope_needed()}
								</Label>
							</div>
						</RadioGroup>
					</div>

					{/* Include condition & grades toggle */}
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-3">
							<Switch
								id="include-grades"
								checked={includeGrades}
								onCheckedChange={setIncludeGrades}
							/>
							<Label htmlFor="include-grades" className="text-(--ink)">
								{m.binder_share_include_grades_label()}
							</Label>
						</div>
						<p className="text-xs text-(--ink-muted) pl-0">
							{m.binder_share_privacy_note()}
						</p>
					</div>

					{/* Generated link */}
					<div className="flex flex-col gap-2">
						<Label className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
							{m.binder_share_link_label()}
						</Label>
						<div className="flex gap-2">
							<Input
								readOnly
								value={url}
								aria-label={m.binder_share_link_aria()}
								className="text-xs font-mono tabular-nums flex-1"
							/>
							<Button
								type="button"
								size="sm"
								onClick={handleCopy}
								disabled={!url}
							>
								{copied ? m.binder_share_copied() : m.binder_share_copy()}
							</Button>
						</div>
						{urlTooLong && (
							<p role="alert" className="text-xs text-(--danger)">
								{m.binder_share_too_long()}
							</p>
						)}
					</div>

					{/* Frozen-snapshot note */}
					<p className="text-xs text-(--ink-muted)">
						{m.binder_share_snapshot_note()}
					</p>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						{m.binder_close()}
					</Button>
					<Button
						type="button"
						variant="soft"
						onClick={handleCopy}
						disabled={!url}
					>
						{copied ? m.binder_share_copied() : m.binder_share_copy_link()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
