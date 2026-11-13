import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildXlsx } from "@tests/support/xlsx";
import { proposeMapping, type ColumnMapping } from "../combine";
import { handleRequest } from "./handle";
import type { WorkerRequest, WorkerResponse } from "./protocol";

const fixture = (name: string) => new File([readFileSync(`tests/fixtures/${name}`)], name, { type: "text/csv" });
const workbook = new File(
  [
    buildXlsx([
      ["Email address", "Full name"],
      ["li.wei@example.test", "Wei Li"],
    ]) as BlobPart,
  ],
  "crm.xlsx",
);

async function run(req: WorkerRequest): Promise<WorkerResponse[]> {
  const out: WorkerResponse[] = [];
  await handleRequest(req, (m) => out.push(m));
  return out;
}
const last = async (req: WorkerRequest) => (await run(req)).at(-1)!;

describe("combining files in the worker", () => {
  const files = [fixture("multi-tradeshow.csv"), fixture("multi-webinar.csv"), workbook];

  it("describes each file's columns, with examples, for the mapping screen", async () => {
    const msg = await last({ type: "inspect", files });
    if (msg.type !== "inspected") throw new Error(`unexpected ${msg.type}`);
    expect(msg.tables.map((t) => [t.name, t.rowCount, t.headers.length])).toEqual([
      ["multi-tradeshow.csv", 3, 6],
      ["multi-webinar.csv", 2, 6],
      ["crm.xlsx", 1, 2],
    ]);
    expect(msg.tables[2]!.samples).toEqual([["li.wei@example.test"], ["Wei Li"]]);
  });

  it("combines CSV and Excel files as mapped, and processes the result", async () => {
    const inspected = await last({ type: "inspect", files });
    if (inspected.type !== "inspected") throw new Error(`unexpected ${inspected.type}`);
    const msg = await last({ type: "combine", files, mapping: proposeMapping(inspected.tables) });
    if (msg.type !== "processed") throw new Error(`unexpected ${msg.type}`);
    const { parsed, duplicates } = msg.result;
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.sources).toEqual({
      files: ["multi-tradeshow.csv", "multi-webinar.csv", "crm.xlsx"],
      starts: [0, 3, 5],
    });
    // Jonas Berg is in the trade-show and webinar lists; Wei Li in the webinar list and the workbook.
    expect(duplicates.map((d) => [d.a, d.b])).toEqual(
      expect.arrayContaining([
        [1, 3],
        [4, 5],
      ]),
    );
  });

  it("reports progress by stage name only", async () => {
    const msgs = await run({ type: "inspect", files });
    expect(msgs.filter((m) => m.type === "progress")).toEqual([{ type: "progress", stage: "parsing" }]);
  });

  it("rejects a mapping that doesn't fit the files with a code", async () => {
    const mapping: ColumnMapping = [{ header: "A", sources: [42, null, null] }];
    expect(await last({ type: "combine", files, mapping })).toEqual({ type: "error", code: "mapping_invalid" });
  });

  it("reports an unreadable workbook among the files with its code", async () => {
    const broken = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0])], "broken.xlsx");
    expect(await last({ type: "inspect", files: [fixture("multi-tradeshow.csv"), broken] })).toEqual({
      type: "error",
      code: "xlsx_invalid",
    });
  });
});
