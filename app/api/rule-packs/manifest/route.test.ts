// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
vi.mock("@vercel/edge-config", () => ({ createClient: vi.fn(() => ({ get })) }));

const { GET } = await import("./route");
const { DEFAULT_MANIFEST, EDGE_CONFIG_KEY } = await import("@/lib/control-plane/rule-pack-manifest");

describe("GET /api/rule-packs/manifest", () => {
  beforeEach(() => get.mockReset());
  afterEach(() => vi.unstubAllEnvs());

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
});
