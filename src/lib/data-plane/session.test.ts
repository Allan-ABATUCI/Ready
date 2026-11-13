import { describe, expect, it } from "vitest";
import { combineTables, proposeMapping } from "./combine";
import { parseCsv } from "./csv";
import { DEFAULT_EXPORT_OPTIONS } from "./export-table";
import { pairKey } from "./merge";
import { processCsv, processParsed } from "./process";
import { SAMPLE_CSV } from "./sample";
import {
  buildSession,
  isSessionFileName,
  parseSession,
  SessionError,
  sessionFileName,
  type SessionState,
} from "./session";
import { restoreSession } from "./session-restore";
import { handleRequest } from "./worker/handle";
import type { WorkerResponse } from "./worker/protocol";

const result = processCsv(SAMPLE_CSV);
const [first, second] = result.duplicates;
const state: SessionState = {
  fileName: "sample-contacts.csv",
  result,
  overrides: { "8:2": "sam@example.test" },
  decisions: {
    [pairKey(first!)]: { action: "merge", fields: { 0: "b" } },
    [pairKey(second!)]: { action: "keep_both", fields: {} },
  },
  crm: "hubspot",
  exportOptions: { ...DEFAULT_EXPORT_OPTIONS, fixEmailTypos: true },
  step: "review",
};

const saved = () => JSON.stringify(buildSession(state));
// Tampering writes values of the wrong type on purpose, so the session is untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tamper = (edit: (s: Record<string, any>) => void) => {
  const s = JSON.parse(saved());
  edit(s);
  return JSON.stringify(s);
};

describe("sessions", () => {
  it("names the file after the data file", () => {
    expect(sessionFileName("leads.csv")).toBe("leads.ready.json");
    expect(sessionFileName("my.leads.xlsx")).toBe("my.leads.ready.json");
    expect(sessionFileName(null)).toBe("contacts.ready.json");
    expect(isSessionFileName("leads.READY.JSON")).toBe(true);
    expect(isSessionFileName("leads.csv")).toBe(false);
  });

  it("round-trips: the same pairs, fixes, decisions and settings come back", () => {
    const restored = restoreSession(parseSession(saved()));
    expect(restored.result.duplicates).toEqual(result.duplicates.map((d) => expect.objectContaining(d)));
    expect(restored.result.parsed).toEqual(result.parsed);
    expect(restored).toMatchObject({
      fileName: "sample-contacts.csv",
      overrides: state.overrides,
      decisions: state.decisions,
      crm: "hubspot",
      exportOptions: state.exportOptions,
      step: "review",
    });
    // The fix is applied in the analysis: the malformed email is no longer flagged.
    const invalidEmails = (r: typeof result) => r.cellIssues.filter((i) => i.code === "invalid_email").length;
    expect(invalidEmails(restored.result)).toBe(invalidEmails(result) - 1);
  });

  it("drops decisions for pairs that are no longer found", () => {
    const text = tamper((s) => {
      s.decisions["0:11"] = { action: "merge", fields: {} };
    });
    expect(Object.keys(restoreSession(parseSession(text)).decisions)).toEqual(Object.keys(state.decisions));
  });

  it("never saves the upload step, so a resumed session opens on real work", () => {
    expect(buildSession({ ...state, step: "upload" }).step).toBe("fix");
  });

  it.each([
    ["not JSON", () => "{nope"],
    ["another format", () => tamper((s) => (s.format = "other"))],
    ["a role past the last column", () => tamper((s) => (s.inputs.roles.email = 99))],
    ["an unknown role", () => tamper((s) => (s.inputs.roles.fax = 1))],
    ["an override outside the file", () => tamper((s) => (s.overrides["99:0"] = "x"))],
    ["a decision with a > b", () => tamper((s) => (s.decisions["3:1"] = { action: "merge", fields: {} }))],
    ["an unknown action", () => tamper((s) => (Object.values<{ action: string }>(s.decisions)[0]!.action = "delete"))],
    ["an unknown CRM", () => tamper((s) => (s.crm = "zoho"))],
    ["a non-string cell", () => tamper((s) => (s.parsed.rows[0][0] = 5))],
    ["an unknown country", () => tamper((s) => (s.inputs.defaultCountry = "XX"))],
  ])("rejects %s", (_, text) => {
    expect(() => parseSession(text())).toThrow(new SessionError("session_invalid"));
  });

  it("says so when the session is from a newer version", () => {
    expect(() => parseSession(tamper((s) => (s.version = 2)))).toThrow(new SessionError("session_version"));
  });

  it("is restored in the worker, which reports codes only on failure", async () => {
    const run = async (text: string) => {
      const out: WorkerResponse[] = [];
      await handleRequest({ type: "resume", file: new File([text], "x.ready.json") }, (m) => out.push(m));
      return out.at(-1)!;
    };
    expect((await run(saved())).type).toBe("restored");
    const bad = await run(tamper((s) => (s.crm = "zoho QUILLON")));
    expect(bad).toEqual({ type: "error", code: "session_invalid" });
  });
});

describe("sessions of combined files", () => {
  const files = [
    { name: "tradeshow.csv", parsed: parseCsv("Name,Email\nAvery Example,avery@example.test\n") },
    { name: "webinar.csv", parsed: parseCsv("Email,Name\navery@example.test,Avery Example\nsam@example.test,Sam\n") },
  ];
  const combined = processParsed(combineTables(files, proposeMapping(files.map((f) => f.parsed))));
  const combinedState: SessionState = {
    ...state,
    fileName: "combined-contacts.csv",
    result: combined,
    overrides: {},
    decisions: {},
  };
  const savedCombined = () => JSON.parse(JSON.stringify(buildSession(combinedState)));

  it("keep which file each row came from", () => {
    const restored = restoreSession(parseSession(JSON.stringify(savedCombined())));
    expect(restored.result.parsed.sources).toEqual({ files: ["tradeshow.csv", "webinar.csv"], starts: [0, 1] });
    expect(restored.result.duplicates.map((d) => [d.a, d.b])).toEqual([[0, 1]]);
  });

  it("are not needed: a single file's session has no sources", () => {
    expect(buildSession(state).parsed).not.toHaveProperty("sources");
    expect(parseSession(saved()).parsed).not.toHaveProperty("sources");
  });

  it.each<[string, (s: { parsed: { sources: unknown } }) => void]>([
    ["sources that aren't an object", (s) => (s.parsed.sources = "x")],
    ["no files", (s) => (s.parsed.sources = { files: [], starts: [] })],
    ["a file name that isn't text", (s) => (s.parsed.sources = { files: [1, "b"], starts: [0, 1] })],
    ["starts not matching the files", (s) => (s.parsed.sources = { files: ["a", "b"], starts: [0] })],
    ["a first file not starting at row 0", (s) => (s.parsed.sources = { files: ["a", "b"], starts: [1, 2] })],
    ["starts going backwards", (s) => (s.parsed.sources = { files: ["a", "b", "c"], starts: [0, 2, 1] })],
    ["a start past the last row", (s) => (s.parsed.sources = { files: ["a", "b"], starts: [0, 9] })],
  ])("reject %s", (_, edit) => {
    const s = savedCombined();
    edit(s);
    expect(() => parseSession(JSON.stringify(s))).toThrow(new SessionError("session_invalid"));
  });
});
