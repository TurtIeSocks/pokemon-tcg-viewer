import { normalizeCssVar } from "./color-picker.helpers"

export interface SwatchEntry {
  value: string
  label: string
}

export interface SwatchRowProps {
  entries: ReadonlyArray<SwatchEntry>
  onPick: (value: string) => void
  ariaLabelPrefix: string
  dataSlot: string
}

export function SwatchRow({
  entries,
  onPick,
  ariaLabelPrefix,
  dataSlot,
}: SwatchRowProps) {
  if (entries.length === 0) return null
  return (
    <div
      data-slot={dataSlot}
      className="flex w-full flex-1 flex-wrap items-center justify-evenly gap-1.5"
    >
      {entries.map((entry) => (
        <button
          key={entry.value}
          type="button"
          aria-label={`${ariaLabelPrefix} ${entry.label}`}
          onClick={() => onPick(entry.value)}
          className="h-5 w-5 shrink-0 cursor-pointer rounded border transition hover:scale-110"
          style={{ backgroundColor: normalizeCssVar(entry.value) }}
        />
      ))}
    </div>
  )
}
