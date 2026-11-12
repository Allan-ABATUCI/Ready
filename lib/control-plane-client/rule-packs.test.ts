import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchSignedRulePack } from "./rule-packs";

describe("fetchSignedRulePack", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("GETs only /api/rule-packs/<crm>, without credentials or body", async () => {
    const fetchMock = vi.fn(async () => Response.json({ payload: "{}", signature: "c2ln" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchSignedRulePack("pipedrive")).resolves.toEqual({ payload: "{}", signature: "c2ln" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/rule-packs/pipedrive", {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
    });
  });

  it("returns null on errors or unexpected shapes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(fetchSignedRulePack("hubspot")).resolves.toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ payload: 1 })),
    );
    await expect(fetchSignedRulePack("hubspot")).resolves.toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    await expect(fetchSignedRulePack("hubspot")).resolves.toBeNull();
  });
});
