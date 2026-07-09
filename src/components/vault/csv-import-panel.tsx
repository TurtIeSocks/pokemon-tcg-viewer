import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import {
	type CorpusIndex,
	queryCorpus,
	setsById,
} from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { allLoadedSets } from "../../store/sets-slice";
import {
	applyMapping,
	type ColumnMap,
	CSV_COLUMNS,
	detectColumns,
	type ImportResolver,
	matchRow,
	normalizeSetName,
	rowToNewStack,
} from "../../store/userland/csv";
import type { NewStack } from "../../store/userland/types";
import { importStacks } from "../../store/userland/userland-store";

interface CsvImportPanelProps {
	/** Parsed CSV rows (header-keyed). */
	rows: Record<string, string>[];
	/** Called after a successful import. */
	onClose: () => void;
}

/** Human-readable label for a CSV_COLUMNS field. Reads the active locale at
 *  call time (invoked from render, not module scope). */
function csvFieldLabel(field: (typeof CSV_COLUMNS)[number]): string {
	switch (field) {
		case "card_id":
			return m.vault_csv_field_card_id();
		case "card_name":
			return m.vault_csv_field_card_name();
		case "set_id":
			return m.vault_csv_field_set_id();
		case "set_name":
			return m.vault_csv_field_set_name();
		case "number":
			return m.vault_csv_field_number();
		case "language":
			return m.vault_csv_field_language();
		case "variant":
			return m.vault_csv_field_variant();
		case "quantity":
			return m.vault_csv_field_quantity();
		case "condition":
			return m.vault_csv_field_condition();
		case "grading_company":
			return m.vault_csv_field_grading_company();
		case "grading_grade":
			return m.vault_csv_field_grading_grade();
		case "grading_cert":
			return m.vault_csv_field_grading_cert();
		case "price_paid_unit":
			return m.vault_csv_field_price_paid_unit();
		case "currency":
			return m.vault_csv_field_currency();
		case "acquired_at":
			return m.vault_csv_field_acquired_at();
		case "source":
			return m.vault_csv_field_source();
		case "storage_location":
			return m.vault_csv_field_storage_location();
		case "label":
			return m.vault_csv_field_label();
		case "notes":
			return m.vault_csv_field_notes();
		default:
			return field;
	}
}

/** A single unmatched row: shows its CSV identity + a corpus search to pick the right card. */
function ReviewRow({
	row,
	index,
	corpusIndex,
	sets,
	onPick,
}: {
	row: Record<string, string>;
	index: number;
	corpusIndex: CorpusIndex | null;
	sets: PokemonSet[] | null | undefined;
	onPick: (cardId: string) => void;
}) {
	const [q, setQ] = useState(row.card_name ?? "");
	const candidates = useMemo(() => {
		if (!corpusIndex || q.trim() === "") return [];
		return queryCorpus(
			corpusIndex,
			{ query: q, relevance: true },
			setsById(sets ?? []),
		).slice(0, 6);
	}, [corpusIndex, sets, q]);

	return (
		<div className="rounded-(--r-control) border border-(--border) bg-(--glass) p-2 flex flex-col gap-1.5">
			<div className="text-xs text-(--ink-muted)">
				{row.card_name || m.vault_csv_no_name()}
				{row.set_name ? ` · ${row.set_name}` : ""}
				{row.number ? ` #${row.number}` : ""}
			</div>
			<Input
				value={q}
				onChange={(e) => setQ(e.target.value)}
				aria-label={m.vault_csv_search_row_aria({ n: index + 1 })}
				placeholder={m.vault_csv_search_placeholder()}
				className="text-sm"
			/>
			{candidates.length > 0 && (
				<div className="flex flex-col gap-1">
					{candidates.map((c) => (
						<button
							key={c.id}
							type="button"
							onClick={() => onPick(c.id)}
							className="text-left text-xs rounded px-2 py-1 hover:bg-(--primary-wash) text-(--ink)"
						>
							{c.name} · {c.setName} #{c.cardNumber}
						</button>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * CSV import flow: editable column mapping (auto-detected, correctable) + live match
 * preview + a review queue (search-pick a card for unmatched rows) + merge toggle + commit.
 */
export function CsvImportPanel({ rows, onClose }: CsvImportPanelProps) {
	const headers = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);
	const [columnMap, setColumnMap] = useState<ColumnMap>(() =>
		detectColumns(headers),
	);
	const [merge, setMerge] = useState(true);
	const [overrides, setOverrides] = useState<Record<number, string>>({});
	const index = useCorpusRuntime((s) => s.index);
	// Imported rows can be any language/region, so match against sets merged
	// across every loaded region rather than the bare west list. allLoadedSets is
	// memoized, so a plain subscription stays ref-stable.
	const sets = useStore(allLoadedSets);

	const resolver = useMemo<ImportResolver>(() => {
		const bySet = new Map<string, string>();
		const bySetName = new Map<string, string>();
		const setNames = sets.length > 0 ? setsById(sets) : null;
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

	const canonicalRows = useMemo(
		() => rows.map((r) => applyMapping(r, columnMap)),
		[rows, columnMap],
	);

	const { matched, review } = useMemo(() => {
		const matched: NewStack[] = [];
		const review: { i: number; row: Record<string, string> }[] = [];
		canonicalRows.forEach((row, i) => {
			const cardId = overrides[i] ?? matchRow(row, resolver);
			if (cardId) matched.push(rowToNewStack(cardId, row));
			else review.push({ i, row });
		});
		return { matched, review };
	}, [canonicalRows, resolver, overrides]);

	async function onImport() {
		if (matched.length === 0) return;
		await importStacks(matched, merge);
		onClose();
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
				{m.vault_csv_column_mapping()}
			</p>
			<div className="grid grid-cols-2 gap-x-3 gap-y-2 max-h-44 overflow-y-auto pr-1">
				{CSV_COLUMNS.map((field) => (
					<label key={field} className="flex flex-col gap-1 text-xs">
						<span className="text-(--ink-muted)">{csvFieldLabel(field)}</span>
						<select
							aria-label={field}
							value={columnMap[field] ?? ""}
							onChange={(e) =>
								setColumnMap((prev) => ({
									...prev,
									[field]: e.target.value || undefined,
								}))
							}
							className="rounded-(--r-control) border border-(--border) bg-(--glass) px-2 py-1 text-(--ink)"
						>
							<option value="">{m.vault_csv_none_option()}</option>
							{headers.map((h) => (
								<option key={h} value={h}>
									{h}
								</option>
							))}
						</select>
					</label>
				))}
			</div>

			<p className="text-sm font-mono tabular-nums text-(--ink-muted)">
				<span className="text-(--ink)">{matched.length}</span>{" "}
				{m.vault_csv_matched()}
				{" · "}
				<span className="text-(--ink)">{review.length}</span>{" "}
				{m.vault_csv_unmatched()}
			</p>

			{review.length > 0 && (
				<div className="flex flex-col gap-2">
					<p className="text-[10.5px] uppercase tracking-[0.18em] text-(--faint) font-semibold">
						{m.vault_csv_needs_review({ count: review.length })}
					</p>
					<div className="max-h-56 overflow-y-auto flex flex-col gap-2">
						{review.map(({ i, row }) => (
							<ReviewRow
								key={i}
								row={row}
								index={i}
								corpusIndex={index}
								sets={sets}
								onPick={(cardId) =>
									setOverrides((o) => ({ ...o, [i]: cardId }))
								}
							/>
						))}
					</div>
				</div>
			)}

			<div className="flex items-center gap-2">
				<label className="mr-auto flex items-center gap-2 text-sm text-(--ink-muted)">
					<input
						type="checkbox"
						checked={merge}
						onChange={(e) => setMerge(e.target.checked)}
					/>
					{m.vault_csv_merge_duplicates()}
				</label>
				<Button onClick={onImport} disabled={matched.length === 0}>
					{m.vault_csv_import_button({ count: matched.length })}
				</Button>
			</div>
		</div>
	);
}
