import { describe, expect, it } from "vitest";
import { applyOperatorAction, getOperatorActionLabel, getSignalLevel } from "../shared/olt";

describe("OLT operational rules", () => {
  it("maps optical power to four signal levels", () => {
    expect(getSignalLevel(-18.2)).toBe(4);
    expect(getSignalLevel(-24.5)).toBe(3);
    expect(getSignalLevel(-28.4)).toBe(2);
    expect(getSignalLevel(-34.7)).toBe(1);
  });

  it("authorizes and disables an ONU without changing reboot state", () => {
    expect(applyOperatorAction("offline", "authorize")).toBe("online");
    expect(applyOperatorAction("online", "disable")).toBe("offline");
    expect(applyOperatorAction("alerta", "reboot")).toBe("alerta");
  });

  it("uses operator-facing labels", () => {
    expect(getOperatorActionLabel("authorize")).toBe("ONU autorizada");
    expect(getOperatorActionLabel("disable")).toBe("ONU desabilitada");
    expect(getOperatorActionLabel("reboot")).toBe("Reboot enviado");
  });
});
