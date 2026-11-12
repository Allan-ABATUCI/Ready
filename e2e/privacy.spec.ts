/**
 * Privacy invariant (CLAUDE.md): no network request may carry file content,
 * column names, file names or values derived from the file.
 *
 * Every request the browser makes (page, workers, beacons) is captured while a
 * fixture full of distinctive sentinel values is processed and exported. Each
 * URL, header and body is then searched for those sentinels in several
 * encodings. Any new outbound call must keep this test green.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Request } from "@playwright/test";

const FIXTURE = path.join(__dirname, "..", "tests", "fixtures", "privacy-sentinel.csv");
// A distinctive file name, so we can assert it never leaves the browser either.
const UPLOAD_NAME = "acme-leads-FILENAME-SENTINEL-QZ7X.csv";

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
  context.on("request", (req) => pending.push(capture(req)));
  page.on("websocket", (ws) => sockets.push(ws.url()));

  const manifestLoaded = page.waitForResponse((r) => r.url().endsWith("/api/rule-packs/manifest"));
  await page.goto("/");
  await manifestLoaded;

  await page.getByTestId("file-input").setInputFiles({
    name: UPLOAD_NAME,
    mimeType: "text/csv",
    buffer: readFileSync(FIXTURE),
  });
  await expect(page.getByTestId("status")).toHaveText("Done.");
  await expect(page.getByTestId("merge-preview")).toContainText("Quillon Zephyrine");

  await page.getByRole("button", { name: "Merge", exact: true }).click();
  const packLoaded = page.waitForResponse((r) => r.url().endsWith("/api/rule-packs/salesforce"));
  await page.getByLabel("Salesforce").check();
  await packLoaded;
  await expect(page.getByTestId("crm-rules")).toContainText("Checked against Salesforce rules");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await download).url()).toMatch(/^blob:/);

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
    NEEDLES.filter((n) => r.haystack.includes(n)).map((n) => `${r.method} ${r.url} contains ${JSON.stringify(n)}`),
  );
  expect(leaks).toEqual([]);

  // The only non-GET requests allowed are explicit control-plane endpoints.
  const nonGet = requests.filter((r) => r.method !== "GET");
  expect(nonGet.map((r) => `${r.method} ${r.url}`)).toEqual([]);
});

test("the production CSP blocks third-party connections", async ({ page }) => {
  const res = await page.goto("/");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toMatch(/connect-src[^;]*(https?:|\*)/);
});
