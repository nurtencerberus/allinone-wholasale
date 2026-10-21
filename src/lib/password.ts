import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-rules";

export { MIN_PASSWORD_LENGTH };

const KEY_LENGTH = 64;
const SCRYPT_COST = 16384;
const SCRYPT_OPTIONS = { N: SCRYPT_COST, r: 8, p: 1 } as const;

/**
 * KYT-10: scrypt runs on the thread pool, not on the event loop. The synchronous version blocked
 * the whole instance for the duration of every sign-in, which on a serverless instance serving
 * several requests is a free denial of service for anyone willing to post login attempts.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: typeof SCRYPT_OPTIONS,
) => Promise<Buffer>;

/** scrypt password hashing — stored as `scrypt$<salt>$<key>` (hex). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hex] = parts;
  try {
    const expected = Buffer.from(hex, "hex");
    const actual = await scryptAsync(password.normalize("NFKC"), salt, expected.length, SCRYPT_OPTIONS);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * One-way digest for bearer tokens (sessions, password reset, e-mail verification).
 * Only the digest is stored, so read access to the database cannot be replayed as a login.
 */
export function digestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Same cost as a real check, so an unknown e-mail takes as long as a wrong password. Built
// synchronously once at module load, where blocking costs nothing.
const DUMMY_SALT = randomBytes(16).toString("hex");
const DUMMY_HASH = `scrypt$${DUMMY_SALT}$${scryptSync(randomToken(16), DUMMY_SALT, KEY_LENGTH, SCRYPT_OPTIONS).toString("hex")}`;

/** Runs a full scrypt comparison even when there is no account, to avoid a timing oracle. */
export async function verifyPasswordOrDummy(password: string, stored: string | null | undefined): Promise<boolean> {
  const ok = await verifyPassword(password, stored ?? DUMMY_HASH);
  return Boolean(stored) && ok;
}

/**
 * KYT-10: what counts as an acceptable password. Length does the heavy lifting; the rest keeps
 * out the handful of strings that attackers try first and the ones built from the address itself.
 */
/**
 * The shapes people actually choose when forced to reach ten characters: a common word with
 * digits bolted on, or a keyboard run. Checking the word alone would be useless — the length
 * rule rejects "password" before it ever gets here.
 */
const COMMON_BASES = [
  "password", "passw0rd", "qwerty", "qwertyuiop", "letmein", "welcome", "iloveyou", "admin",
  "administrator", "changeme", "trustno", "monkey", "dragon", "sunshine", "princess", "football",
  "baseball", "wholesale", "ciputra", "meridian",
];
const KEYBOARD_RUNS = ["1234567890", "0987654321", "qwertyuiop", "asdfghjkl", "abcdefghij"];

/** "P@ssw0rd" is "password" to everyone except a naive string comparison. */
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };

function deLeet(value: string): string {
  return [...value.toLowerCase()]
    .map((character) => LEET[character] ?? character)
    .filter((character) => /[a-z]/.test(character))
    .join("");
}

export function passwordProblem(password: string, email?: string | null): string | null {
  const value = password.normalize("NFKC");
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (value.length > 256) return "Passwords are limited to 256 characters.";

  const lower = value.toLowerCase();
  if (/^(.)\1+$/.test(value)) return "A single repeated character is not a password.";
  if (KEYBOARD_RUNS.some((run) => lower.includes(run))) {
    return "That is a keyboard run, which is one of the first things an attacker tries.";
  }

  // "password123", "Welcome2026!", "P@ssw0rd" — a common word with padding is still that word.
  const letters = deLeet(value);
  if (COMMON_BASES.some((base) => letters.startsWith(base) && letters.length - base.length <= 4)) {
    return "That password is one of the first an attacker tries. Choose another.";
  }

  const local = email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (local && local.length > 2 && lower.replace(/[^a-z0-9]/g, "").includes(local)) {
    return "Do not use your e-mail address in the password.";
  }
  return null;
}
