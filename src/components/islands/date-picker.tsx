"use client";

import { format, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// The form layer speaks `yyyy-MM-dd` (see stack-form-mapping `dayMsToInput`/
// `inputDayToMs`). date-fns `format`/`parse` both operate in LOCAL time — the
// same basis as that mapping — so a stored day round-trips with no timezone
// shift. Computed once at module load (not per render) to stay React-Compiler
// pure, mirroring CURRENT_YEAR in search-controls.
const DAY_FMT = "yyyy-MM-dd";
const TODAY = new Date();
// English TCG launch — earliest sensible acquire date; also bounds the year
// dropdown so it doesn't offer absurd past/future years.
const FIRST_ACQUIRE_MONTH = new Date(1999, 0);

/** Parse a `yyyy-MM-dd` string to a local Date; "" or garbage → undefined. */
function parseDay(value: string): Date | undefined {
	if (!value) return undefined;
	const d = parse(value, DAY_FMT, TODAY);
	return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface DatePickerProps {
	/** Selected day as `yyyy-MM-dd` ("" when unset). */
	value: string;
	/** Fires the chosen day as `yyyy-MM-dd`. */
	onChange: (value: string) => void;
	/** Runs when the popover closes (e.g. to trigger field-blur validation). */
	onClose?: () => void;
	id?: string;
	/** Reflected onto the trigger for shadcn Field invalid styling. */
	"aria-invalid"?: boolean;
	className?: string;
}

/**
 * Controlled single-day picker. Speaks `yyyy-MM-dd` strings at its boundary so
 * it drops into a string-valued form field with no schema/mapping change.
 */
export function DatePicker({
	value,
	onChange,
	onClose,
	id,
	"aria-invalid": ariaInvalid,
	className,
}: DatePickerProps) {
	const [open, setOpen] = React.useState(false);
	const selected = parseDay(value);

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) onClose?.();
			}}
		>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					aria-invalid={ariaInvalid}
					className={cn(
						"w-full justify-start px-2.5 font-normal",
						!selected && "text-muted-foreground",
						className,
					)}
				>
					<CalendarIcon />
					{selected ? format(selected, "LLL dd, y") : <span>Pick a date</span>}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					required
					captionLayout="dropdown"
					startMonth={FIRST_ACQUIRE_MONTH}
					endMonth={TODAY}
					defaultMonth={selected}
					selected={selected}
					onSelect={(d) => {
						if (d) onChange(format(d, DAY_FMT));
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
