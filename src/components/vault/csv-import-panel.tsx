import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStore } from "../../store";
import { setsById } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import {
	applyMapping,
	type ColumnMap,
	CSV_COLUMNS,
	csvToImport,
	detectColumns,
	type ImportResolver,
	normalizeSetName,
} from "../../store/userland/csv";
import { importStacks } from "../../store/userland/userland-store";

interface CsvImportPanelProps {
	/** Parsed CSV rows (header-keyed). */
	rows: Record<string, string>[];
	/** Called after a successful import. */
	onClose: () => void;
}

/**
 * CSV import flow: editable column mapping (auto-detected, user-correctable) +
 * live match preview + merge toggle + commit. Rendered inside {@link ImportDialog}.
 */
export function CsvImportPanel({ rows, onClose }: CsvImportPanelProps) {
	const headers = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);
	const [columnMap, setColumnMap] = useState<ColumnMap>(() =>
		detectColumns(headers),
	);
	const [merge, setMerge] = useState(true);
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);

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

	const result = useMemo(
		() =>
			csvToImport(
				rows.map((r) => applyMapping(r, columnMap)),
				resolver,
			),
		[rows, columnMap, resolver],
	);

	async function onImport() {
		if (result.matched.length === 0) return;
		await importStacks(result.matched, merge);
		onClose();
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold">
				Column mapping
			</p>
			<div className="grid grid-cols-2 gap-x-3 gap-y-2 max-h-56 overflow-y-auto pr-1">
				{CSV_COLUMNS.map((field) => (
					<label key={field} className="flex flex-col gap-1 text-xs">
						<span className="text-[var(--ink-muted)]">
							{field.replace(/_/g, " ")}
						</span>
						<select
							aria-label={field}
							value={columnMap[field] ?? ""}
							onChange={(e) =>
								setColumnMap((m) => ({
									...m,
									[field]: e.target.value || undefined,
								}))
							}
							className="rounded border border-[var(--border)] bg-[var(--glass)] px-2 py-1"
						>
							<option value="">—</option>
							{headers.map((h) => (
								<option key={h} value={h}>
									{h}
								</option>
							))}
						</select>
					</label>
				))}
			</div>

			<p className="text-sm font-mono tabular-nums text-[var(--ink-muted)]">
				<span className="text-[var(--ink)]">{result.matched.length}</span>{" "}
				matched
				{" · "}
				<span className="text-[var(--ink)]">{result.unmatched.length}</span>{" "}
				unmatched
			</p>

			<div className="flex items-center gap-2">
				<label className="mr-auto flex items-center gap-2 text-sm text-[var(--ink-muted)]">
					<input
						type="checkbox"
						checked={merge}
						onChange={(e) => setMerge(e.target.checked)}
					/>
					Merge duplicate stacks
				</label>
				<Button onClick={onImport} disabled={result.matched.length === 0}>
					Import {result.matched.length} stack
					{result.matched.length === 1 ? "" : "s"}
				</Button>
			</div>
		</div>
	);
}
