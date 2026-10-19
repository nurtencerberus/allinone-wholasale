import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, normaliseRecoveryCode, newRecoveryCodes, totpAt, verifyTotp } from "@/lib/totp";

// RFC 6238 Appendix B: SHA-1 secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30), 8)).toBe("89005924");
    expect(totpAt(RFC_SECRET, Math.floor(20000000000 / 30), 8)).toBe("65353130");
  });

  it("round-trips base32", () => {
    const data = Buffer.from([0, 1, 2, 250, 255, 128, 7]);
    expect(base32Decode(base32Encode(data))).toEqual(data);
  });

  it("accepts the current and adjacent steps, and refuses a reused step", () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    const code = totpAt(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, null, now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 3), null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, step, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", null, now)).toBeNull();
  });

  it("normalises recovery codes as typed", () => {
    const [code] = newRecoveryCodes(1);
    expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/);
    expect(normaliseRecoveryCode(` ${code.replace("-", "").toUpperCase()} `)).toBe(code);
  });
});
