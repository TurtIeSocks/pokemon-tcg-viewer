import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { parseSnapshot } from "../../store/userland/backup";
import type { UserDataSnapshot } from "../../store/userland/types";
import { importUserData } from "../../store/userland/userland-store";

/** Props for {@link ImportDialog}. */
interface ImportDialogProps {
	/** Whether the dialog is visible. */
	open: boolean;
	/** Called when the dialog requests open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
}

/** Dialog for importing a JSON backup; supports merge (additive) or replace (destructive) strategies. */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
	const [snapshot, setSnapshot] = useState<UserDataSnapshot | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	function resetState() {
		setSnapshot(null);
		setError(null);
		if (fileRef.current) fileRef.current.value = "";
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) resetState();
		onOpenChange(nextOpen);
	}

	async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setError(null);
		setSnapshot(null);
		try {
			const text = await file.text();
			const snap = parseSnapshot(text);
			setSnapshot(snap);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Import failed");
		}
	}

	async function onMerge() {
		if (!snapshot) return;
		await importUserData(snapshot, "merge");
		handleOpenChange(false);
	}

	async function onReplace() {
		if (!snapshot) return;
		const ok = window.confirm(
			"Replace your entire collection + binders with this backup?",
		);
		if (!ok) return;
		await importUserData(snapshot, "replace");
		handleOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Import backup</DialogTitle>
					<DialogDescription className="text-[var(--ink-muted)]">
						Choose a JSON backup file to restore your collection and binders.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					{/* Dropzone / file picker */}
					<label className="flex flex-col items-center justify-center gap-2 rounded-[var(--r-panel)] border border-dashed border-[var(--border)] bg-[var(--glass)] px-4 py-6 cursor-pointer text-center hover:border-[var(--primary)] transition-colors">
						<span className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold">
							JSON backup file
						</span>
						<span className="text-sm text-[var(--ink-muted)]">
							Click to browse or drop a file here
						</span>
						<input
							ref={fileRef}
							type="file"
							accept="application/json"
							onChange={onFileChange}
							className="sr-only"
						/>
					</label>

					{error && <p className="text-sm text-[var(--danger)]">{error}</p>}

					{snapshot && (
						<p className="text-sm font-mono tabular-nums text-[var(--ink-muted)]">
							<span className="text-[var(--ink)]">
								{snapshot.collection.length}
							</span>{" "}
							cards
							{" · "}
							<span className="text-[var(--ink)]">
								{snapshot.binders.length}
							</span>{" "}
							binders
						</p>
					)}
				</div>

				{snapshot && (
					<DialogFooter>
						<Button variant="ghost" onClick={onMerge}>
							Merge
						</Button>
						<Button variant="destructive" onClick={onReplace}>
							Replace
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
