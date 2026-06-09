// src/store/userland/uuid.ts

/**
 * Generate a UUIDv7 (RFC 9562): a 128-bit id whose first 48 bits are a
 * big-endian Unix-millisecond timestamp, followed by version `7`, the `10`
 * variant, and 74 random bits.
 *
 * Why v7 over `crypto.randomUUID()` (which is v4 = fully random): the client
 * mints this id locally and it becomes the row's primary key when the Vault
 * syncs to Postgres. Time-ordered ids keep inserts append-mostly in the B-tree
 * (no index fragmentation from scattered random keys) and sort by creation time
 * for free. Within a single millisecond, ordering falls back to the random tail.
 */
export function uuidv7(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);

	// 48-bit timestamp, big-endian, into bytes[0..5]. Use floor/mod rather than
	// bitwise ops: Date.now() is > 2^40, and `&` coerces to a 32-bit int, which
	// would silently truncate the high-order timestamp bytes.
	let t = Date.now();
	for (let i = 5; i >= 0; i--) {
		bytes[i] = t % 256;
		t = Math.floor(t / 256);
	}

	bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7 in the high nibble of byte 6
	bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx in the high bits of byte 8

	const hex: string[] = [];
	for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
	return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
		.slice(6, 8)
		.join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
