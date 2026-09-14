import { describe, expect, it } from "vitest";
import { executeOperatorAction, parseOnuDetail, parseOnuPower, parseOnuState, updateOltConfig } from "./zteAdapter";

describe("ZTE C300 adapter parsing", () => {
  it("parses ONU state rows", () => {
    const rows = parseOnuState("1/8/1:4     enable       enable      working      1(GPON)\n1/8/1:7     enable       disable     OffLine      1(GPON)");
    expect(rows).toEqual([
      { interfaceName: "1/8/1:4", status: "online" },
      { interfaceName: "1/8/1:7", status: "offline" },
    ]);
  });

  it("parses real detail fields", () => {
    const detail = parseOnuDetail("Name: ONU-1:4\nType: ZTE-F680\nState: ready\nPhase state: working\nSerial number: KAON0901FA05\nDescription: maria.luiza@pauqueimado\nONU Distance: 2519m\nOnline Duration: 32h 55m 15s");
    expect(detail.name).toBe("maria.luiza@pauqueimado");
    expect(detail.serial).toBe("KAON0901FA05");
    expect(detail.distance).toBe(2.519);
    expect(detail.online).toBe(true);
  });

  it("parses downstream ONU RX power", () => {
    const power = parseOnuPower("up Rx :-25.623(dbm) Tx:2.378(dbm)\ndown Tx :5.846(dbm) Rx:-22.366(dbm)");
    expect(power).toBe(-22.366);
  });

  it("rejects an invalid ONU target before opening Telnet", async () => {
    await expect(executeOperatorAction("reboot", "invalid-target")).rejects.toThrow("ONU identifier is invalid");
  });

  it("rejects invalid editable OLT settings", () => {
    expect(() => updateOltConfig({ host: "not valid", snmpPort: 7361, telnetPort: 7326, boards: "8:8,9:16" })).toThrow("Host/IP inválido");
    expect(() => updateOltConfig({ host: "45.162.123.46", snmpPort: 0, telnetPort: 7326, boards: "8:8,9:16" })).toThrow("Porta SNMP inválida");
  });
});
