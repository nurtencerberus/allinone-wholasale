import { describe, expect, it } from "vitest";
import { isDocumentKind, normaliseEin, sniffDocument } from "@/lib/application-docs";

describe("sniffDocument", () => {
  it("accepts a PDF by its magic bytes, not its name", () => {
    expect(sniffDocument(Buffer.from("%PDF-1.7\nrest of the file"))).toEqual({ mime: "application/pdf", ext: "pdf" });
  });
  it("accepts a photo of a certificate", () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
    expect(sniffDocument(jpeg)).toEqual({ mime: "image/jpeg", ext: "jpg" });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
    expect(sniffDocument(png)).toEqual({ mime: "image/png", ext: "png" });
  });
  it("refuses anything else, however it is named", () => {
    expect(sniffDocument(Buffer.from("<?php echo 1; ?>"))).toBeNull();
    expect(sniffDocument(Buffer.from("GIF89a"))).toBeNull();
    expect(sniffDocument(Buffer.alloc(0))).toBeNull();
  });
});

describe("normaliseEin", () => {
  it("stores one shape whatever was typed", () => {
    expect(normaliseEin("123456789")).toBe("12-3456789");
    expect(normaliseEin("12-3456789")).toBe("12-3456789");
    expect(normaliseEin(" 12 345 6789 ")).toBe("12-3456789");
  });
  it("leaves something that is not an EIN alone", () => {
    expect(normaliseEin("pending")).toBe("pending");
  });
});

describe("isDocumentKind", () => {
  it("only accepts the four kinds the desk asks for", () => {
    expect(isDocumentKind("resale_certificate")).toBe(true);
    expect(isDocumentKind("w9")).toBe(true);
    expect(isDocumentKind("passport")).toBe(false);
  });
});
