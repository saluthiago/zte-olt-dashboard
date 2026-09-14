import { describe, expect, it } from "vitest";
import { getLiveOltSnapshot } from "./zteAdapter";

describe.skipIf(process.env.OLT_RUN_LIVE_TESTS !== "1")("ZTE C300 live snapshot", () => {
  it("reads the configured boards and returns real ONU telemetry", async () => {
    const snapshot = await getLiveOltSnapshot();
    expect(snapshot.connected).toBe(true);
    expect(snapshot.source).toBe("real");
    expect(snapshot.model).toBe("ZTE C300");
    expect(snapshot.onus.length).toBeGreaterThan(0);
    expect(snapshot.onus.every((onu) => /^\d+\/\d+\/\d+:\d+$/.test(onu.id))).toBe(true);
  }, 90000);
});
