/**
 * Map an internal supported-language code to a valid HTML `lang` (BCP-47) tag.
 * Only the two Chinese codes need script+region subtags; everything else is
 * already a valid language subtag and passes through.
 */
const BCP47_OVERRIDES: Record<string, string> = {
	"zh-tw": "zh-Hant-TW",
	"zh-cn": "zh-Hans-CN",
};

export function bcp47(lang: string): string {
	return BCP47_OVERRIDES[lang] ?? lang;
}
