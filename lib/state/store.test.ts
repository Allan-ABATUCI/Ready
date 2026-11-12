import { beforeEach, describe, expect, it } from "vitest";
import { useReadyStore } from "./store";

describe("useReadyStore", () => {
  beforeEach(() => useReadyStore.getState().reset());

  it("moves through processing → ready and resets", () => {
    const s = useReadyStore.getState();
    s.startProcessing("contacts.csv");
    expect(useReadyStore.getState()).toMatchObject({ status: "processing", fileName: "contacts.csv" });
    s.finishProcessing({
      parsed: { headers: [], rows: [], delimiter: ",", hadBom: false, issues: [] },
      profile: [],
      duplicates: [],
      cellIssues: [],
    });
    expect(useReadyStore.getState().status).toBe("ready");
    s.reset();
    expect(useReadyStore.getState()).toMatchObject({ status: "idle", fileName: null, result: null });
  });

  it("does not persist anything to web storage", () => {
    useReadyStore.getState().startProcessing("secret-name.csv");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
