export type OperatorAction = "authorize" | "disable" | "reboot";
export type ONUStatus = "online" | "alerta" | "offline";

export function getSignalLevel(signal: number) {
  if (signal > -22) return 4;
  if (signal > -26) return 3;
  if (signal > -30) return 2;
  return 1;
}

export function applyOperatorAction(status: ONUStatus, action: OperatorAction): ONUStatus {
  if (action === "authorize") return "online";
  if (action === "disable") return "offline";
  return status;
}

export function getOperatorActionLabel(action: OperatorAction) {
  return action === "reboot" ? "Reboot enviado" : action === "disable" ? "ONU desabilitada" : "ONU autorizada";
}
