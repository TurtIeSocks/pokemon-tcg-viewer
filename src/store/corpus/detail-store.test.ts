import { expect, test } from "bun:test";
import {
	clearDetail,
	readDetailGz,
	readDetailMeta,
	writeDetail,
} from "./detail-store";

test("writeDetail then read returns gz + meta; clear removes both", async () => {
	const gz = new Uint8Array([1, 2, 3]).buffer;
	const meta = { version: "v1", syncedAt: 123, count: 2, enabled: true };
	await writeDetail(gz, meta);
	expect(await readDetailMeta()).toEqual(meta);
	expect(new Uint8Array((await readDetailGz()) as ArrayBuffer)).toEqual(
		new Uint8Array([1, 2, 3]),
	);
	await clearDetail();
	expect(await readDetailMeta()).toBeUndefined();
	expect(await readDetailGz()).toBeUndefined();
});
