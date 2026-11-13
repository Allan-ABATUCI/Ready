// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureRequestLog } from "@tests/support/request-log";

const get = vi.fn();
vi.mock("@vercel/edge-config", () => ({ createClient: vi.fn(() => ({ get })) }));

const { GET } = await import("./route");
const { DEFAULT_MANIFEST, EDGE_CONFIG_KEY } = await import("@/lib/control-plane/rule-pack-manifest");

describe("GET /api/rule-packs/manifest", () => {
  beforeEach(() => get.mockReset());
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("serves the bundled default when Edge Config is not configured", async () => {
    vi.stubEnv("EDGE_CONFIG", "");
    const res = await GET();
    expect(await res.json()).toEqual(DEFAULT_MANIFEST);
    expect(get).not.toHaveBeenCalled();
  });

  it("reads only the manifest key from Edge Config", async () => {
    vi.stubEnv("EDGE_CONFIG", "https://edge-config.example.test/ecfg_test?token=t");
    const manifest = { packs: [{ crm: "hubspot", version: "2.1.0" }] };
    get.mockResolvedValue(manifest);
    const res = await GET();
    expect(await res.json()).toEqual(manifest);
    expect(get).toHaveBeenCalledExactlyOnceWith(EDGE_CONFIG_KEY);
  });

  it("falls back to the default on invalid shape or Edge Config errors", async () => {
    vi.stubEnv("EDGE_CONFIG", "https://edge-config.example.test/ecfg_test?token=t");
    get.mockResolvedValueOnce({ packs: [{ crm: "unknown", version: "1" }] });
    expect(await (await GET()).json()).toEqual(DEFAULT_MANIFEST);
    get.mockRejectedValueOnce(new Error("down"));
    expect(await (await GET()).json()).toEqual(DEFAULT_MANIFEST);
  });

  it("logs why it fell back, but not the connection string or the error", async () => {
    vi.stubEnv("EDGE_CONFIG", "https://edge-config.example.test/ecfg_test?token=SECRET-TOKEN");
    const log = captureRequestLog();
    get.mockResolvedValueOnce({ packs: "nope" });
    await GET();
    get.mockRejectedValueOnce(new Error("down: https://edge-config.example.test/ecfg_test?token=SECRET-TOKEN"));
    await GET();
    expect(log.entries()).toMatchObject([
      { route: "rule_pack_manifest", status: 200, code: "edge_config_invalid" },
      { route: "rule_pack_manifest", status: 200, code: "edge_config_failed" },
    ]);
    expect(log.raw()).not.toContain("SECRET-TOKEN");
  });
});
