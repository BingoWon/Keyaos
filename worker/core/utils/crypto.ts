/**
 * AES-GCM encryption utilities for API key storage
 *
 * Uses Web Crypto API (native in Cloudflare Workers).
 * Encryption key is injected via `wrangler secret put ENCRYPTION_KEY`.
 */

const ALGO = "AES-GCM";
const IV_BYTES = 12;

async function deriveKey(secret: string): Promise<CryptoKey> {
	const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
	return crypto.subtle.importKey("raw", raw, ALGO, false, [
		"encrypt",
		"decrypt",
	]);
}

export async function encrypt(
	plaintext: string,
	secret: string,
): Promise<string> {
	const key = await deriveKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const encoded = new TextEncoder().encode(plaintext);

	const ciphertext = await crypto.subtle.encrypt(
		{ name: ALGO, iv },
		key,
		encoded,
	);

	// Format: base64(iv + ciphertext)
	const combined = new Uint8Array(iv.length + ciphertext.byteLength);
	combined.set(iv);
	combined.set(new Uint8Array(ciphertext), iv.length);

	return btoa(String.fromCharCode(...combined));
}

export async function decrypt(
	encrypted: string,
	secret: string,
): Promise<string> {
	const key = await deriveKey(secret);
	const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

	const iv = combined.slice(0, IV_BYTES);
	const ciphertext = combined.slice(IV_BYTES);

	const decrypted = await crypto.subtle.decrypt(
		{ name: ALGO, iv },
		key,
		ciphertext,
	);

	return new TextDecoder().decode(decrypted);
}
