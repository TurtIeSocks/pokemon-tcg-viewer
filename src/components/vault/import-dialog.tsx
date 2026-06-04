import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useStore } from "../../store";
import { setsById } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { parseSnapshot } from "../../store/userland/backup";
import {
	applyMapping,
	type CsvImportResult,
	csvToImport,
	detectColumns,
	type ImportResolver,
	normalizeSetName,
	parseCsv,
} from "../../store/userland/csv";
import type { UserDataSnapshot } from "../../store/userland/types";
import {
	importStacks,
	importUserData,
} from "../../store/userland/userland-store";

/** Props for {@link ImportDialog}. */
interface ImportDialogProps {
	/** Whether the dialog is visible. */
	open: boolean;
	/** Called when the dialog requests open-state change; caller owns the state. */
	onOpenChange: (open: boolean) => void;
}

/** Dialog for importing a JSON backup (merge/replace) or a CSV file (additive, matched against the corpus). */
export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
	const [snapshot, setSnapshot] = useState<UserDataSnapshot | null>(null);
	const [csv, setCsv] = useState<CsvImportResult | null>(null);
	const [merge, setMerge] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);

	// Card matcher from the corpus: card_id existence + setId|number and setName|number lookups.
	const resolver = useMemo<ImportResolver>(() => {
		const bySet = new Map<string, string>();
		const bySetName = new Map<string, string>();
		const setNames = sets ? setsById(sets) : null;
		if (index) {
			for (const card of index.byId.values()) {
				bySet.set(`${card.setId}|${card.number}`, card.id);
				const name = setNames?.get(card.setId)?.name;
				if (name)
					bySetName.set(`${normalizeSetName(name)}|${card.number}`, card.id);
			}
		}
		return {
			exists: (id) => index?.byId.has(id) ?? false,
			bySetNumber: (setId, number) => bySet.get(`${setId}|${number}`),
			bySetNameNumber: (setName, number) =>
				bySetName.get(`${normalizeSetName(setName)}|${number}`),
		};
	}, [index, sets]);

	function resetState() {
		setSnapshot(null);
		setCsv(null);
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
		setCsv(null);
		try {
			const text = await file.text();
			if (file.name.toLowerCase().endsWith(".csv")) {
				const { rows } = parseCsv(text);
				const map = detectColumns(Object.keys(rows[0] ?? {}));
				const canonical = rows.map((r) => applyMapping(r, map));
				setCsv(csvToImport(canonical, resolver));
			} else {
				setSnapshot(parseSnapshot(text));
			}
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

	async function onImportCsv() {
		if (!csv || csv.matched.length === 0) return;
		await importStacks(csv.matched, merge);
		handleOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="font-display">Import backup</DialogTitle>
					<DialogDescription className="text-[var(--ink-muted)]">
						Choose a JSON backup (restore) or a CSV file (add matched cards).
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					{/* Dropzone / file picker */}
					<label className="flex flex-col items-center justify-center gap-2 rounded-[var(--r-panel)] border border-dashed border-[var(--border)] bg-[var(--glass)] px-4 py-6 cursor-pointer text-center hover:border-[var(--primary)] transition-colors">
						<span className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold">
							JSON or CSV file
						</span>
						<span className="text-sm text-[var(--ink-muted)]">
							Click to browse or drop a file here
						</span>
						<input
							ref={fileRef}
							type="file"
							accept=".json,.csv,application/json,text/csv"
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

					{csv && (
						<p className="text-sm font-mono tabular-nums text-[var(--ink-muted)]">
							<span className="text-[var(--ink)]">{csv.matched.length}</span>{" "}
							matched
							{" · "}
							<span className="text-[var(--ink)]">{csv.unmatched.length}</span>{" "}
							unmatched
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

				{csv && (
					<DialogFooter>
						<label className="mr-auto flex items-center gap-2 text-sm text-[var(--ink-muted)]">
							<input
								type="checkbox"
								checked={merge}
								onChange={(e) => setMerge(e.target.checked)}
							/>
							Merge duplicate stacks
						</label>
						<Button onClick={onImportCsv} disabled={csv.matched.length === 0}>
							Import {csv.matched.length} stack
							{csv.matched.length === 1 ? "" : "s"}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	);
}
