import { beforeEach, describe, expect, it } from "vitest";
import { useReadyStore } from "./store";

describe("useReadyStore", () => {
  beforeEach(() => useReadyStore.getState().reset());

  it("moves through processing → ready and resets", () => {
    const s = useReadyStore.getState();
    s.startProcessing("contacts.csv");
    expect(useReadyStore.getState()).toMatchObject({ status: "processing", fileName: "contacts.csv" });
    s.finishProcessing({
      parsed: { headers: [], rows: [], delimiter: ",", hadBom: false, encoding: "utf-8", issues: [] },
      profile: [],
      duplicates: [],
      skippedLargeBlocks: 0,
      cellIssues: [],
    });
    expect(useReadyStore.getState().status).toBe("ready");
    s.reset();
    expect(useReadyStore.getState()).toMatchObject({ status: "idle", fileName: null, result: null });
  });

  it("tracks the current stage only while processing", () => {
    const s = useReadyStore.getState();
    s.setStage("matching");
    expect(useReadyStore.getState().stage).toBeNull(); // not processing yet
    s.startProcessing("contacts.csv");
    s.setStage("parsing");
    s.setStage("matching");
    expect(useReadyStore.getState().stage).toBe("matching");
    s.failProcessing();
    s.setStage("checking"); // a late message after the run ended
    expect(useReadyStore.getState()).toMatchObject({ status: "error", stage: null });
  });

  it("records merge decisions and field picks, and clears them on reset", () => {
    const s = useReadyStore.getState();
    s.finishProcessing({
      parsed: {
        headers: ["Name"],
        rows: [["A"], ["a"], ["B"], ["b"]],
        delimiter: ",",
        hadBom: false,
        encoding: "utf-8",
        issues: [],
      },
      profile: [],
      duplicates: [
        { a: 0, b: 1, score: 100, matchedOn: ["email"] },
        { a: 2, b: 3, score: 92, matchedOn: ["name"] },
        { a: 1, b: 2, score: 100, matchedOn: ["phone"] },
      ],
      skippedLargeBlocks: 0,
      cellIssues: [],
    });

    s.chooseField(1, 0, "b");
    expect(useReadyStore.getState().decisions).toEqual({ "2:3": { action: "merge", fields: { 0: "b" } } });

    s.decide(1, "keep_both");
    expect(useReadyStore.getState().decisions["2:3"]).toEqual({ action: "keep_both", fields: { 0: "b" } });

    s.mergeAllExact();
    expect(useReadyStore.getState().decisions["0:1"]).toEqual({ action: "merge", fields: {} });
    expect(useReadyStore.getState().decisions["2:3"]?.action).toBe("keep_both");
    expect(useReadyStore.getState().decisions["1:2"]).toBeUndefined(); // phone-only: review by hand

    s.decide(99, "merge");
    expect(Object.keys(useReadyStore.getState().decisions)).toHaveLength(2);

    s.reset();
    expect(useReadyStore.getState().decisions).toEqual({});
  });

  it("tracks the destination CRM and export options, and resets them", () => {
    const s = useReadyStore.getState();
    expect(useReadyStore.getState().crm).toBeNull();
    s.setCrm("pipedrive");
    s.setExportOption("fixCase", false);
    expect(useReadyStore.getState()).toMatchObject({
      crm: "pipedrive",
      exportOptions: { trim: true, lowercaseEmails: true, fixCase: false },
    });
    s.reset();
    expect(useReadyStore.getState()).toMatchObject({
      crm: null,
      exportOptions: { trim: true, lowercaseEmails: true, fixCase: true },
    });
  });

  it("tracks rule-pack loading and ignores results for a CRM that is no longer selected", () => {
    const s = useReadyStore.getState();
    const pack = { crm: "hubspot" as const, version: "1.0.0", requiredFields: ["Email"], formats: {} };
    s.setCrm("hubspot");
    expect(useReadyStore.getState()).toMatchObject({ rulePack: null, rulePackStatus: "loading" });
    s.setCrm("salesforce");
    s.setRulePack("hubspot", pack);
    expect(useReadyStore.getState()).toMatchObject({ rulePack: null, rulePackStatus: "loading" });
    s.setRulePack("salesforce", null);
    expect(useReadyStore.getState().rulePackStatus).toBe("failed");
    s.setCrm("hubspot");
    s.setRulePack("hubspot", pack);
    expect(useReadyStore.getState()).toMatchObject({ rulePack: pack, rulePackStatus: "verified" });
    s.reset();
    expect(useReadyStore.getState()).toMatchObject({ rulePack: null, rulePackStatus: "idle" });
  });

  it("does not persist anything to web storage", () => {
    useReadyStore.getState().startProcessing("secret-name.csv");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
