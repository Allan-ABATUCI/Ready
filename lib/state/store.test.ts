import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_LIMIT, useReadyStore } from "./store";

describe("useReadyStore", () => {
  beforeEach(() => useReadyStore.getState().reset());

  it("moves through processing → ready and resets", () => {
    const s = useReadyStore.getState();
    s.startProcessing("contacts.csv");
    expect(useReadyStore.getState()).toMatchObject({ status: "processing", fileName: "contacts.csv" });
    s.finishProcessing({
      parsed: { headers: [], rows: [], delimiter: ",", hadBom: false, encoding: "utf-8", issues: [] },
      profile: [],
      roles: {},
      dateOrder: null,
      defaultCountry: null,
      duplicates: [],
      skippedLargeBlocks: 0,
      cellIssues: [],
    });
    expect(useReadyStore.getState().status).toBe("ready");
    s.reset();
    expect(useReadyStore.getState()).toMatchObject({ status: "idle", fileName: null, result: null });
  });

  it("guides through the steps: upload only until a file is ready, then fix first", () => {
    const s = useReadyStore.getState();
    expect(useReadyStore.getState().step).toBe("upload");
    s.setStep("review");
    expect(useReadyStore.getState().step).toBe("upload"); // nothing to review yet
    s.startProcessing("contacts.csv");
    s.setStep("export");
    expect(useReadyStore.getState().step).toBe("upload");
    s.finishProcessing({
      parsed: { headers: [], rows: [], delimiter: ",", hadBom: false, encoding: "utf-8", issues: [] },
      profile: [],
      roles: {},
      dateOrder: null,
      defaultCountry: null,
      duplicates: [],
      skippedLargeBlocks: 0,
      cellIssues: [],
    });
    expect(useReadyStore.getState().step).toBe("fix");
    s.setStep("export");
    expect(useReadyStore.getState().step).toBe("export");
    s.setStep("upload");
    expect(useReadyStore.getState().step).toBe("upload");
    s.reset();
    expect(useReadyStore.getState().step).toBe("upload");
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

  it("reassigns a column role, clears decisions and ignores stale analyses", () => {
    const s = useReadyStore.getState();
    expect(s.setRole("email", 1)).toBeNull(); // no file yet
    s.finishProcessing({
      parsed: { headers: ["Name", "Inbox"], rows: [], delimiter: ",", hadBom: false, encoding: "utf-8", issues: [] },
      profile: [],
      roles: { name: 0 },
      dateOrder: null,
      defaultCountry: null,
      duplicates: [{ a: 0, b: 1, score: 95, matchedOn: ["name"] }],
      skippedLargeBlocks: 0,
      cellIssues: [],
    });
    s.decide(0, "merge");

    const first = s.setRole("email", 1)!.inputs;
    expect(first).toEqual({ roles: { name: 0, email: 1 }, dateOrder: null, defaultCountry: null });
    expect(useReadyStore.getState()).toMatchObject({
      pendingAnalysis: { inputs: first, scope: "all" },
      decisions: {},
      result: { roles: first.roles },
    });

    const second = s.setRole("email", 0)!.inputs; // the user changes their mind before the first finishes
    expect(second.roles).toEqual({ email: 0 });

    const analysis = { duplicates: [], skippedLargeBlocks: 0, cellIssues: [] };
    s.finishAnalysis(first, { ...analysis, skippedLargeBlocks: 99 });
    expect(useReadyStore.getState()).toMatchObject({
      pendingAnalysis: { inputs: second },
      result: { skippedLargeBlocks: 0 },
    });

    s.finishAnalysis(second, analysis);
    expect(useReadyStore.getState()).toMatchObject({
      pendingAnalysis: null,
      result: { roles: { email: 0 }, duplicates: [] },
    });
  });

  describe("setDateOrder", () => {
    const duplicates = [{ a: 0, b: 1, score: 95, matchedOn: ["name" as const] }];
    const dateIssue = { row: 0, col: 1, code: "ambiguous_date" as const };
    beforeEach(() =>
      useReadyStore.getState().finishProcessing({
        parsed: { headers: ["Name", "Signup"], rows: [], delimiter: ",", hadBom: false, encoding: "utf-8", issues: [] },
        profile: [],
        roles: { name: 0 },
        dateOrder: null,
        defaultCountry: null,
        duplicates,
        skippedLargeBlocks: 0,
        cellIssues: [dateIssue],
      }),
    );

    it("re-analyzes with the new order and keeps merge decisions", () => {
      const s = useReadyStore.getState();
      s.decide(0, "merge");
      s.selectCandidate(0);

      const request = s.setDateOrder("dmy")!;
      const { inputs } = request;
      // Dates never affect matching, so only issues are re-checked.
      expect(request).toEqual({
        inputs: { roles: { name: 0 }, dateOrder: "dmy", defaultCountry: null },
        scope: "issues",
      });
      expect(useReadyStore.getState()).toMatchObject({
        pendingAnalysis: request,
        result: { dateOrder: "dmy" },
        decisions: { "0:1": { action: "merge" } },
      });

      s.finishAnalysis(inputs, { cellIssues: [] });
      expect(useReadyStore.getState()).toMatchObject({
        pendingAnalysis: null,
        result: { dateOrder: "dmy", cellIssues: [], duplicates },
        decisions: { "0:1": { action: "merge" } },
      });
    });

    it("does nothing when the order doesn't change or there is no file", () => {
      expect(useReadyStore.getState().setDateOrder(null)).toBeNull();
      useReadyStore.getState().reset();
      expect(useReadyStore.getState().setDateOrder("dmy")).toBeNull();
    });

    it("becomes a full analysis that clears decisions when it replaces a pending role change", () => {
      const s = useReadyStore.getState();
      s.setRole("email", 1);
      s.decide(0, "merge"); // made against the old pairs while the role change runs
      const { inputs, scope } = s.setDateOrder("mdy")!;
      expect(scope).toBe("all"); // or the role change's new pairs would never arrive
      expect(inputs.roles).toEqual({ name: 0, email: 1 });
      s.finishAnalysis(inputs, { duplicates, skippedLargeBlocks: 0, cellIssues: [] });
      expect(useReadyStore.getState().decisions).toEqual({});
    });
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
      roles: {},
      dateOrder: null,
      defaultCountry: null,
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

  it("changing the default phone country re-analyzes and clears decisions", () => {
    const s = useReadyStore.getState();
    s.finishProcessing({
      parsed: { headers: ["Name", "Phone"], rows: [], delimiter: ",", hadBom: false, encoding: "utf-8", issues: [] },
      profile: [],
      roles: { name: 0, phone: 1 },
      dateOrder: "dmy",
      defaultCountry: null,
      duplicates: [{ a: 0, b: 1, score: 95, matchedOn: ["name"] }],
      skippedLargeBlocks: 0,
      cellIssues: [],
    });
    s.decide(0, "merge");
    expect(s.setDefaultCountry(null)).toBeNull(); // unchanged

    const request = s.setDefaultCountry("FR")!;
    expect(request).toEqual({
      inputs: { roles: { name: 0, phone: 1 }, dateOrder: "dmy", defaultCountry: "FR" },
      scope: "all",
    });
    expect(useReadyStore.getState()).toMatchObject({
      result: { defaultCountry: "FR" },
      decisions: {},
      history: [],
      pendingAnalysis: request,
    });
  });

  describe("bulk decisions and undo", () => {
    const duplicates = Array.from({ length: 60 }, (_, i) => ({
      a: 2 * i,
      b: 2 * i + 1,
      score: 90,
      matchedOn: ["name" as const],
    }));
    const load = () =>
      useReadyStore.getState().finishProcessing({
        parsed: { headers: ["Name"], rows: [], delimiter: ",", hadBom: false, encoding: "utf-8", issues: [] },
        profile: [],
        roles: { name: 0 },
        dateOrder: null,
        defaultCountry: null,
        duplicates,
        skippedLargeBlocks: 0,
        cellIssues: [],
      });
    beforeEach(load);
    const state = () => useReadyStore.getState();

    it("decides many pairs at once, keeping field picks, as one undo step", () => {
      state().chooseField(1, 0, "b");
      state().decideMany([0, 1, 2, 999], "keep_both");
      expect(state().decisions).toEqual({
        "0:1": { action: "keep_both", fields: {} },
        "2:3": { action: "keep_both", fields: { 0: "b" } },
        "4:5": { action: "keep_both", fields: {} },
      });
      expect(state().history).toHaveLength(2);

      state().undo();
      expect(state().decisions).toEqual({ "2:3": { action: "merge", fields: { 0: "b" } } });
      state().undo();
      expect(state().decisions).toEqual({});
      state().undo(); // nothing left: no-op
      expect(state().decisions).toEqual({});
    });

    it("adds no undo step when nothing changes", () => {
      state().decide(0, "merge");
      state().decide(0, "merge");
      state().decideMany([0], "merge");
      state().decideMany([], "keep_both");
      state().mergeAllExact(); // no exact matches here
      expect(state().history).toHaveLength(1);
    });

    it("keeps at most HISTORY_LIMIT steps, dropping the oldest", () => {
      for (let i = 0; i < HISTORY_LIMIT + 10; i++) state().decide(i, "merge");
      expect(state().history).toHaveLength(HISTORY_LIMIT);
      for (let i = 0; i < HISTORY_LIMIT; i++) state().undo();
      // The first 10 decisions can no longer be undone.
      expect(Object.keys(state().decisions)).toEqual(duplicates.slice(0, 10).map((c) => `${c.a}:${c.b}`));
    });

    it("is cleared by a role change and by a new file, but not by a date-order change", () => {
      state().decide(0, "merge");
      state().setDateOrder("dmy");
      expect(state().history).toHaveLength(1);

      state().setRole("email", 0);
      expect(state()).toMatchObject({ decisions: {}, history: [] });

      load();
      state().decide(0, "merge");
      state().startProcessing("next.csv");
      expect(state().history).toEqual([]);
      load();
      state().decide(0, "merge");
      load();
      expect(state().history).toEqual([]);
    });
  });

  describe("cell overrides", () => {
    const load = () =>
      useReadyStore.getState().finishProcessing({
        parsed: {
          headers: ["Name", "Email", "Signup"],
          rows: [
            ["Avery Example", "bad@", "2024-02-30"],
            ["Bo Sample", "bo@example.test", ""],
          ],
          delimiter: ",",
          hadBom: false,
          encoding: "utf-8",
          issues: [],
        },
        profile: [],
        roles: { name: 0, email: 1 },
        dateOrder: null,
        defaultCountry: null,
        duplicates: [{ a: 0, b: 1, score: 91, matchedOn: ["name"] }],
        skippedLargeBlocks: 0,
        cellIssues: [],
      });
    beforeEach(load);
    const state = () => useReadyStore.getState();

    it("records an edit to a non-role column and re-checks issues only, keeping decisions", () => {
      state().decide(0, "merge");
      const request = state().setOverride(0, 2, "2024-02-28")!;
      expect(request.scope).toBe("issues");
      expect(state()).toMatchObject({
        overrides: { "0:2": "2024-02-28" },
        decisions: { "0:1": { action: "merge" } },
        pendingAnalysis: request,
      });
      // The loaded file is untouched; the edit is applied downstream.
      expect(state().result!.parsed.rows[0]![2]).toBe("2024-02-30");
    });

    it("re-runs matching and clears decisions for an edit to a role column", () => {
      state().decide(0, "merge");
      expect(state().setOverride(0, 1, "avery@example.test")!.scope).toBe("all");
      expect(state()).toMatchObject({ decisions: {}, history: [], overrides: { "0:1": "avery@example.test" } });
    });

    it("ignores edits that change nothing, and edits to rows that don't exist", () => {
      expect(state().setOverride(0, 1, "bad@")).toBeNull();
      state().setOverride(0, 1, "a@example.test");
      expect(state().setOverride(0, 1, "a@example.test")).toBeNull();
      expect(state().setOverride(99, 0, "x")).toBeNull();
      expect(state().overrides).toEqual({ "0:1": "a@example.test" });
    });

    it("keeps edits across a role change, and drops them for a new file or a reset", () => {
      state().setOverride(0, 2, "2024-02-28");
      state().setRole("company", 2);
      expect(state().overrides).toEqual({ "0:2": "2024-02-28" });
      load();
      expect(state().overrides).toEqual({});
      state().setOverride(0, 2, "2024-02-28");
      state().reset();
      expect(state().overrides).toEqual({});
    });
  });
});
