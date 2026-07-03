import { expect, test } from "bun:test";
import { TP_SUBTYPE_TO_CODE, toCents } from "./price-types";

test("toCents converts float major units to integer cents", () => {
	expect(toCents(720.34)).toBe(72034);
	expect(toCents(0.07)).toBe(7);
	// Classic float trap: 19.99 * 100 = 1998.9999999999998
	expect(toCents(19.99)).toBe(1999);
	expect(toCents(0)).toBe(0);
});

test("toCents passes null/undefined through as null", () => {
	expect(toCents(null)).toBeNull();
	expect(toCents(undefined)).toBeNull();
});

test("TP_SUBTYPE_TO_CODE maps tcgcsv subTypeName vocabulary", () => {
	expect(TP_SUBTYPE_TO_CODE.Normal).toBe("N");
	expect(TP_SUBTYPE_TO_CODE.Holofoil).toBe("H");
	expect(TP_SUBTYPE_TO_CODE["Reverse Holofoil"]).toBe("R");
	expect(TP_SUBTYPE_TO_CODE["1st Edition Holofoil"]).toBe("1H");
	expect(TP_SUBTYPE_TO_CODE["1st Edition Normal"]).toBe("1N");
	// Vintage "Unlimited" rows are the same physical printing as the plain names.
	expect(TP_SUBTYPE_TO_CODE["Unlimited Holofoil"]).toBe("H");
	expect(TP_SUBTYPE_TO_CODE["Unlimited Normal"]).toBe("N");
	expect(TP_SUBTYPE_TO_CODE["Some Future Subtype"]).toBeUndefined();
});
