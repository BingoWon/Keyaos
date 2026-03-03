const keyCache = new Map<string, CryptoKey>();

async function deriveKey(base64Key: string): Promise<CryptoKey> {
	let key = keyCache.get(base64Key);
	if (key) return key;
	const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
	key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
		"encrypt",
		"decrypt",
	]);
	keyCache.set(base64Key, key);
	return key;
}

/** AES-256-GCM encrypt. Returns base64(iv ‖ ciphertext). */
export async function encrypt(
	plaintext: string,
	base64Key: string,
): Promise<string> {
	const key = await deriveKey(base64Key);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ct = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv },
			key,
			new TextEncoder().encode(plaintext),
		),
	);
	const buf = new Uint8Array(12 + ct.length);
	buf.set(iv);
	buf.set(ct, 12);
	return btoa(String.fromCharCode(...buf));
}

/** AES-256-GCM decrypt. Accepts base64(iv ‖ ciphertext). */
export async function decrypt(
	blob: string,
	base64Key: string,
): Promise<string> {
	const key = await deriveKey(base64Key);
	const buf = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
	const plaintext = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: buf.slice(0, 12) },
		key,
		buf.slice(12),
	);
	return new TextDecoder().decode(plaintext);
}

/** SHA-256 hash, returned as base64. */
export async function sha256(input: string): Promise<string> {
	const hash = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

/** Mask a secret for safe display: first N chars + ••• + last M chars. */
export function mask(secret: string, prefixLen = 10, suffixLen = 3): string {
	if (secret.length <= prefixLen + suffixLen) return "•".repeat(secret.length);
	return `${secret.slice(0, prefixLen)}•••${secret.slice(-suffixLen)}`;
}
