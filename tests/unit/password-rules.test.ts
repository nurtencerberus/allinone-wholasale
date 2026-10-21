import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, passwordProblem } from "@/lib/password";

describe("passwordProblem", () => {
  it("accepts an ordinary strong password", () => {
    expect(passwordProblem("warehouse-tulip-42", "dana@harborhouse.com")).toBeNull();
  });
  it("asks for length first", () => {
    expect(passwordProblem("short1!")).toMatch(new RegExp(String(MIN_PASSWORD_LENGTH)));
  });
  it("refuses an unbounded password", () => {
    expect(passwordProblem("a".repeat(257))).toMatch(/256/);
  });
  it("refuses a common word with padding bolted on", () => {
    expect(passwordProblem("password123")).toMatch(/attacker/);
    expect(passwordProblem("Welcome2026")).toMatch(/attacker/);
    expect(passwordProblem("Passw0rd!!")).toMatch(/attacker/);
  });
  it("refuses a keyboard run", () => {
    expect(passwordProblem("qwertyuiop12")).toMatch(/keyboard run/);
    expect(passwordProblem("my1234567890")).toMatch(/keyboard run/);
  });
  it("refuses a single repeated character", () => {
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/repeated/);
  });
  it("refuses a password built from the address", () => {
    expect(passwordProblem("harborhouse2026", "harborhouse@example.com")).toMatch(/e-mail/);
    // A short local part is not distinctive enough to judge on.
    expect(passwordProblem("ab-strong-enough-2026", "ab@example.com")).toBeNull();
  });
});
