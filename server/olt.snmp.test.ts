import snmp from "net-snmp";
import { describe, expect, it } from "vitest";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required OLT secret: ${name}`);
  return value;
}

function snmpReadOnlyProbe() {
  const host = requiredEnv("OLT_ZTE_HOST");
  const port = Number(requiredEnv("OLT_ZTE_SNMP_PORT"));
  const community = requiredEnv("OLT_ZTE_SNMP_COMMUNITY");

  return new Promise<{ ok: boolean; detail: string }>((resolve) => {
    let settled = false;
    const session = snmp.createSession(host, community, {
      port,
      version: snmp.Version2c,
      timeout: 7000,
      retries: 1,
    });
    const oids = ["1.3.6.1.2.1.1.1.0", "1.3.6.1.2.1.1.5.0"];
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      session.close();
      resolve({ ok: false, detail: `SNMP timeout at ${host}:${port}/udp; verify firewall or port forwarding` });
    }, 8500);
    session.get(oids, (error, varbinds) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.close();
      if (error) {
        resolve({ ok: false, detail: error.message });
        return;
      }
      const values = varbinds.map((item) => String(item.value ?? ""));
      const hasIdentity = values.some((value) => value.length > 0);
      resolve({ ok: hasIdentity, detail: hasIdentity ? `SNMP responded: ${values.join(" | ")}` : "SNMP returned empty identity values" });
    });
  });
}

describe.skipIf(process.env.OLT_RUN_LIVE_TESTS !== "1")("ZTE OLT SNMP v2c protected connection", () => {
  it("reads system description and hostname without modifying the OLT", async () => {
    const result = await snmpReadOnlyProbe();
    expect(result.ok, result.detail).toBe(true);
  }, 12000);
});
