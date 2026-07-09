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
import { m } from "../../paraglide/messages";
import { parseSnapshot } from "../../store/userland/backup";
import { parseCsv } from "../../store/userland/csv";
import type { UserDataSnapshot } from "../../store/userland/types";
import { importUserData } from "../../store/userland/userland-store";
import { CsvImportPanel } from "./csv-import-panel";

/** Props for {@link ImportDialog}. */
interface ImportDialogProps {
	/** Whether the dialog is visible. */
	open: boolean;
	/** Called when the dialog requests open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
}

/** Import a JSON backup (merge/replace) or a CSV file (mapped + matched, via CsvImportPanel). */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
	const [snapshot, setSnapshot] = useState<UserDataSnapshot | null>(null);
	const [csvRows, setCsvRows] = useState<Record<string, string>[] | null>(null);
	const [csvKey, setCsvKey] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);

	function resetState() {
		setSnapshot(null);
		setCsvRows(null);
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
		setCsvRows(null);
		try {
			const text = await file.text();
			if (file.name.toLowerCase().endsWith(".csv")) {
				setCsvRows(parseCsv(text).rows);
				setCsvKey((k) => k + 1);
			} else {
				setSnapshot(parseSnapshot(text));
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : m.vault_import_failed());
		}
	}

	async function onMerge() {
		if (!snapshot) return;
		await importUserData(snapshot, "merge");
		handleOpenChange(false);
	}

	async function onReplace() {
		if (!snapshot) return;
		const ok = window.confirm(m.vault_import_replace_confirm());
		if (!ok) return;
		await importUserData(snapshot, "replace");
		handleOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">
						{m.vault_import_title()}
					</DialogTitle>
					<DialogDescription>{m.vault_import_description()}</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					{/* Dropzone / file picker */}
					<label className="flex flex-col items-center justify-center gap-2 rounded-(--r-panel) border border-dashed border-(--border) bg-(--glass) px-4 py-6 cursor-pointer text-center hover:border-(--primary) transition-colors">
						<span className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
							{m.vault_import_dropzone_hint()}
						</span>
						<span className="text-sm text-(--ink-muted)">
							{m.vault_import_dropzone_action()}
						</span>
						<input
							ref={fileRef}
							type="file"
							accept=".json,.csv,application/json,text/csv"
							onChange={onFileChange}
							className="sr-only"
						/>
					</label>

					{error && <p className="text-sm text-(--danger)">{error}</p>}

					{snapshot && (
						<p className="text-sm font-mono tabular-nums text-(--ink-muted)">
							<span className="text-(--ink)">{snapshot.collection.length}</span>{" "}
							{m.vault_import_cards_label()}
							{" · "}
							<span className="text-(--ink)">{snapshot.binders.length}</span>{" "}
							{m.vault_import_binders_label()}
						</p>
					)}

					{csvRows && (
						<CsvImportPanel
							key={csvKey}
							rows={csvRows}
							onClose={() => handleOpenChange(false)}
						/>
					)}
				</div>

				{snapshot && (
					<DialogFooter>
						<Button variant="ghost" onClick={onMerge}>
							{m.vault_import_merge()}
						</Button>
						<Button variant="destructive" onClick={onReplace}>
							{m.vault_import_replace()}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
