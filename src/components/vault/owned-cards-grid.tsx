import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../../store";
import { loadCorpus } from "../../store/corpus/corpus-runtime";
import type { SortDir, SortKey } from "../../store/userland/card-rows";
import { useOwnedCardRows } from "../../store/userland/selectors";
import { Button } from "../ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { OwnedCardTile } from "./owned-card-tile";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
	{ value: "set", label: "Set & number" },
	{ value: "acquired", label: "Date acquired" },
	{ value: "price", label: "Price paid" },
	{ value: "year", label: "Year released" },
];

export function OwnedCardsGrid() {
	const loadSets = useStore((s) => s.loadSets);
	const [key, setKey] = useState<SortKey>("set");
	const [dir, setDir] = useState<SortDir>("asc");

	useEffect(() => {
		void loadCorpus();
		void loadSets();
	}, [loadSets]);

	const rows = useOwnedCardRows(key, dir);

	if (rows.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground">
				Your binder is empty. Add cards from any set.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center gap-2">
				<Select value={key} onValueChange={(v) => setKey(v as SortKey)}>
					<SelectTrigger size="sm" className="w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SORT_OPTIONS.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					size="sm"
					variant="outline"
					onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
					aria-label={dir === "asc" ? "Sort descending" : "Sort ascending"}
				>
					{dir === "asc" ? (
						<ArrowUpIcon className="size-4" />
					) : (
						<ArrowDownIcon className="size-4" />
					)}
				</Button>
			</div>
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{rows.map((row) => (
					<li key={row.card.id}>
						<OwnedCardTile row={row} />
					</li>
				))}
			</ul>
		</div>
	);
}
