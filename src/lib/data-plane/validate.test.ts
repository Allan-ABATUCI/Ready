import { describe, expect, it } from "vitest";
import { isIsoDate, isValidEmail, isValidPhone, normalizePhone } from "./validate";

describe("email", () => {
  it.each(["a@example.test", " A.B+tag@sub.example.test ", "zoë@exämple.test"])("accepts %j", (v) =>
    expect(isValidEmail(v)).toBe(true),
  );
  it.each(["", "a@", "@example.test", "a@example", "a b@example.test", "a@@example.test", "a@example.c"])(
    "rejects %j",
    (v) => expect(isValidEmail(v)).toBe(false),
  );
});

describe("phone", () => {
  it.each([
    ["+44 20 7946 0958", "+442079460958"],
    ["(555) 010-0001", "5550100001"],
    ["+81-3-1234-5678", "+81312345678"],
    ["030 123456", "030123456"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
    expect(isValidPhone(input)).toBe(true);
  });
  it.each(["", "12345", "+1234567890123456", "call me", "555-CALL-NOW"])("rejects %j", (v) =>
    expect(isValidPhone(v)).toBe(false),
  );
});

describe("ISO date", () => {
  it.each(["2024-02-29", "1999-12-31"])("accepts %j", (v) => expect(isIsoDate(v)).toBe(true));
  it.each(["2023-02-29", "2024-13-01", "2024-00-10", "24-01-01", "01/02/2024", ""])("rejects %j", (v) =>
    expect(isIsoDate(v)).toBe(false),
  );
});
