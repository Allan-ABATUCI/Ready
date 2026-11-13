/**
 * Privacy invariant (CLAUDE.md): no network request may carry file content,
 * column names, file names or values derived from the file.
 *
 * Every request the browser makes (page, workers, beacons) is captured while a
 * fixture full of distinctive sentinel values is processed and exported. Each
 * URL, header and body is then searched for those sentinels in several
 * encodings, as are the values quoted in the downloaded change report. Any new
 * outbound call must keep this test green.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Request } from "@playwright/test";
import Papa from "papaparse";
import { goToStep } from "./steps";

const FIXTURE = path.join(__dirname, "..", "fixtures", "privacy-sentinel.csv");
// A distinctive file name, so we can assert it never leaves the browser either.
const UPLOAD_NAME = "acme-leads-FILENAME-SENTINEL-QZ7X.csv";

// A CRM export to compare against: its own sentinels, and one contact shared with the fixture.
const CRM_NAME = "crm-export-CRMFILE-SENTINEL-WV3K.csv";
const CRM_CSV = [
  "First Name,Last Name,Email,Vexmorrow Field WV3K",
  "Zoë,Ångström-Qz7x,zoe.qz7x@example.test,Brannoch WV3K",
  "Ysolde,Vexmorrow,ysolde.vexmorrow.wv3k@example.test,Brannoch WV3K",
].join("\n");

// A second file to combine with the fixture: its own name and values, one contact shared.
const SECOND_NAME = "webinar-SECONDFILE-SENTINEL-HN4R.csv";
const SECOND_CSV = [
  "E-mail;Full Name;Orvane Column HN4R",
  "quillon.zephyrine.qz7x@example.test;Quillon Zephyrine;Talmery HN4R",
  "orvane.hn4r@example.test;Orvane Talmery;Talmery HN4R",
].join("\n");

const csv = readFileSync(FIXTURE, "utf8");
const [headerLine = "", ...dataLines] = csv.trim().split(/\r?\n/);

const SENTINELS: string[] = [
  UPLOAD_NAME,
  "FILENAME-SENTINEL",
  "QZ7X", // appears in many cells and the custom header; case-insensitive search below
  "Sentinel Region",
  "Quillon",
  "Zephyrine",
  "Northmarch",
  "Südmark",
  "Ångström",
  "quillon.zephyrine",
  "7946 0958",
  "2079460958", // phone, normalized
  "5550107788",
  ...headerLine.split(","),
  ...dataLines.flatMap((l) => l.split(",")),
  CRM_NAME,
  "CRMFILE-SENTINEL",
  "WV3K",
  "Vexmorrow",
  "Ysolde",
  "Brannoch",
  SECOND_NAME,
  "SECONDFILE-SENTINEL",
  "HN4R",
  "Orvane",
  "Talmery",
].filter((s) => s.length >= 4);

function variants(s: string): string[] {
  const lower = s.toLowerCase();
  return [
    lower,
    encodeURIComponent(s).toLowerCase(),
    encodeURIComponent(s).replace(/%20/g, "+").toLowerCase(),
    Buffer.from(s, "utf8").toString("base64").toLowerCase(),
    lower.normalize("NFD"),
  ];
}

const NEEDLES = [...new Set(SENTINELS.flatMap(variants))];

interface Captured {
  url: string;
  method: string;
  haystack: string;
}

async function capture(req: Request): Promise<Captured> {
  const headers = await req.allHeaders().catch(() => ({}));
  const body = req.postDataBuffer();
  const url = req.url();
  let decodedUrl = url;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {}
  const haystack = [
    url,
    decodedUrl,
    JSON.stringify(headers),
    body ? body.toString("utf8") : "",
    body ? body.toString("latin1") : "",
  ]
    .join("\n")
    .toLowerCase();
  return { url, method: req.method(), haystack };
}

test("processing and exporting a file sends no file data over the network", async ({ page, context, baseURL }) => {
  const pending: Promise<Captured>[] = [];
  const sockets: string[] = [];
  const consoleLines: string[] = [];
  context.on("request", (req) => pending.push(capture(req)));
  page.on("websocket", (ws) => sockets.push(ws.url()));
  page.on("console", (msg) => consoleLines.push(msg.text()));
  page.on("pageerror", (err) => consoleLines.push(`${err.name}: ${err.message}`));
  // Turn on the production debug log (src/lib/diagnostics.ts), so its output is checked too.
  await context.addInitScript(() => localStorage.setItem("ready:debug", "1"));

  const manifestLoaded = page.waitForResponse((r) => r.url().endsWith("/api/rule-packs/manifest"));
  await page.goto("/");
  await manifestLoaded;

  await page.getByTestId("file-input").setInputFiles({
    name: UPLOAD_NAME,
    mimeType: "text/csv",
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await goToStep(page, "Review");
  await expect(page.getByTestId("merge-preview")).toContainText("Quillon Zephyrine");

  await page.getByRole("button", { name: "Merge", exact: true }).click();

  // The CRM export is compared in the browser too, and neither file leaves it.
  await page.getByTestId("crm-file-input").setInputFiles({
    name: CRM_NAME,
    mimeType: "text/csv",
    buffer: Buffer.from(CRM_CSV),
  });
  await expect(page.getByTestId("crm-compare-status")).toContainText("already in your CRM");
  await goToStep(page, "Export");
  await expect(page.getByTestId("export-summary")).toContainText("already in your CRM");
  const packLoaded = page.waitForResponse((r) => r.url().endsWith("/api/rule-packs/salesforce"));
  await page.getByLabel("Salesforce").check();
  await packLoaded;
  await expect(page.getByTestId("crm-rules")).toContainText("Checked against Salesforce rules");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).url()).toMatch(/^blob:/);

  // The change report quotes file values (before / after), so it must stay a local blob too.
  const reportDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download change report" }).click();
  const report = await reportDownload;
  expect(report.url()).toMatch(/^blob:/);
  expect(report.suggestedFilename()).toBe("ready-salesforce-report.csv");
  const reportRows = Papa.parse<string[]>(readFileSync((await report.path())!, "utf8")).data;
  const detailStart = reportRows.findIndex((r) => r[0] === "Row in export");
  // Every before / after value it quotes must stay off the network, like the file itself.
  const reportNeedles = reportRows
    .slice(detailStart + 1)
    .flatMap((r) => [r[3] ?? "", r[4] ?? ""])
    .filter((v) => v.length >= 4)
    .flatMap(variants);
  // Sanity: the report really holds file data (the phone conversion), so the check means something.
  expect(reportRows.slice(detailStart + 1).some((r) => r[3] === "+44 20 7946 0958")).toBe(true);
  expect(reportNeedles.length).toBeGreaterThan(0);

  // A saved session holds the whole file, so it must be a local blob too, never a request.
  const sessionDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save progress" }).click();
  expect((await sessionDownload).url()).toMatch(/^blob:/);

  await page.getByRole("button", { name: "Start over" }).click();
  await page.waitForLoadState("networkidle");

  const requests = await Promise.all(pending);

  // Sanity: interception works and saw the control-plane call we expect.
  expect(requests.some((r) => r.url.endsWith("/api/rule-packs/manifest"))).toBe(true);

  // Rule-pack calls carry only the user-chosen CRM identifier: exact path, no query, GET.
  const packCalls = requests.filter((r) => new URL(r.url).pathname.startsWith("/api/rule-packs/"));
  expect(packCalls.map((r) => `${r.method} ${new URL(r.url).pathname}${new URL(r.url).search}`).sort()).toEqual([
    "GET /api/rule-packs/manifest",
    "GET /api/rule-packs/salesforce",
  ]);

  // Nothing leaves for a third-party origin.
  const origin = new URL(baseURL!).origin;
  const external = requests.filter(
    (r) => !r.url.startsWith(origin) && !r.url.startsWith("blob:") && !r.url.startsWith("data:"),
  );
  expect(external.map((r) => r.url)).toEqual([]);

  // No WebSockets at all in production.
  expect(sockets).toEqual([]);

  // No sentinel, in any encoding, in any URL, header or body.
  const leaks = requests.flatMap((r) =>
    [...NEEDLES, ...reportNeedles]
      .filter((n) => r.haystack.includes(n))
      .map((n) => `${r.method} ${r.url} contains ${JSON.stringify(n)}`),
  );
  expect(leaks).toEqual([]);

  // The only non-GET requests allowed are explicit control-plane endpoints.
  const nonGet = requests.filter((r) => r.method !== "GET");
  expect(nonGet.map((r) => `${r.method} ${r.url}`)).toEqual([]);

  // The debug log was on (sanity) and holds no sentinel either.
  expect(consoleLines.some((l) => l.startsWith('[ready] {"kind":"stage"'))).toBe(true);
  expect(consoleLines.some((l) => l.includes('"kind":"rule_pack"'))).toBe(true);
  const consoleLeaks = consoleLines.flatMap((l) =>
    NEEDLES.filter((n) => l.toLowerCase().includes(n)).map((n) => `console: ${l} contains ${JSON.stringify(n)}`),
  );
  expect(consoleLeaks).toEqual([]);
});

test("combining several files sends no file data over the network", async ({ page, context, baseURL }) => {
  const pending: Promise<Captured>[] = [];
  const consoleLines: string[] = [];
  context.on("request", (req) => pending.push(capture(req)));
  page.on("console", (msg) => consoleLines.push(msg.text()));
  // Production debug log on, so its output is checked too.
  await page.addInitScript(() => localStorage.setItem("ready:debug", "1"));

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([
    { name: UPLOAD_NAME, mimeType: "text/csv", buffer: readFileSync(FIXTURE) },
    { name: SECOND_NAME, mimeType: "text/csv", buffer: Buffer.from(SECOND_CSV) },
  ]);
  await page.getByRole("button", { name: "Combine 2 files →" }).click();
  await expect(page.getByTestId("status")).toHaveText("Done.");

  await goToStep(page, "Review");
  await expect(page.getByTestId("pair-list")).toContainText(SECOND_NAME);
  await goToStep(page, "Export");
  await page.getByLabel("Salesforce").check();
  await page.getByLabel("Add a “Source file” column").check();
  await expect(page.getByTestId("crm-rules")).toContainText("Checked against Salesforce rules");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const exported = readFileSync((await (await download).path())!, "utf8");
  expect(exported).toContain(SECOND_NAME); // sanity: the names really are in the data
  await page.waitForLoadState("networkidle");

  const requests = await Promise.all(pending);
  expect(requests.some((r) => r.url.endsWith("/api/rule-packs/manifest"))).toBe(true);
  const origin = new URL(baseURL!).origin;
  expect(requests.filter((r) => !/^(blob|data):/.test(r.url) && !r.url.startsWith(origin)).map((r) => r.url)).toEqual(
    [],
  );
  expect(requests.filter((r) => r.method !== "GET").map((r) => `${r.method} ${r.url}`)).toEqual([]);
  const leaks = requests.flatMap((r) =>
    NEEDLES.filter((n) => r.haystack.includes(n)).map((n) => `${r.method} ${r.url} contains ${JSON.stringify(n)}`),
  );
  expect(leaks).toEqual([]);

  expect(consoleLines.some((l) => l.startsWith('[ready] {"kind":"stage"'))).toBe(true);
  const consoleLeaks = consoleLines.flatMap((l) =>
    NEEDLES.filter((n) => l.toLowerCase().includes(n)).map((n) => `console: ${l} contains ${JSON.stringify(n)}`),
  );
  expect(consoleLeaks).toEqual([]);
});

test("the production CSP blocks third-party connections", async ({ page }) => {
  const res = await page.goto("/");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toMatch(/connect-src[^;]*(https?:|\*)/);
});
