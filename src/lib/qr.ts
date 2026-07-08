import qrcode from "qrcode-generator";

/** Standard QR quiet-zone width, in modules. */
const QUIET = 4;

export interface QrSvg {
	/** viewBox side length in modules (data grid + quiet zone on both sides). */
	count: number;
	/** SVG path `d` covering every dark module, offset into the quiet zone. */
	path: string;
}

/**
 * Encode `text` as a QR code and return the data to render it as ONE inline SVG
 * <path>. Returns null for empty text or the rare overflow (text longer than the
 * largest QR version) so one bad card can never throw the whole print sheet.
 *
 * DOM-free (pure string math) → unit-testable without a browser. The caller draws:
 *   <svg viewBox="0 0 count count"><rect .. fill=white/><path d=path fill=black/></svg>
 * SVG shapes are FOREGROUND paint, so — unlike a CSS background — the code prints.
 */
export function qrSvgPath(text: string): QrSvg | null {
	if (!text) return null;
	try {
		const qr = qrcode(0, "M"); // type 0 = smallest fitting version; ECC level M
		qr.addData(text, "Byte"); // URLs have lowercase → byte mode, not alphanumeric
		qr.make();
		const n = qr.getModuleCount();
		let path = "";
		for (let r = 0; r < n; r++) {
			for (let c = 0; c < n; c++) {
				if (qr.isDark(r, c)) path += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
			}
		}
		return { count: n + QUIET * 2, path };
	} catch {
		return null;
	}
}
