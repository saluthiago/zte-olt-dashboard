import net from "node:net";
import snmp from "net-snmp";

export type LiveONU = {
  id: string;
  serial: string;
  mac: string;
  name: string;
  slot: string;
  status: "online" | "alerta" | "offline";
  signal: number;
  distance: number;
  uptime: string;
  lastEvent: string;
  profile: string;
};

export type LiveOltSnapshot = {
  connected: boolean;
  host: string;
  model: string;
  hostname: string;
  transport: "SNMP v2c + Telnet";
  source: "real";
  syncedAt: number;
  onus: LiveONU[];
};

export type OperatorAction = "authorize" | "disable" | "reboot";
export type OltConfig = {
  host: string;
  snmpPort: number;
  telnetPort: number;
  boards: string;
  communityConfigured: boolean;
  usernameConfigured: boolean;
};

const overrides: Partial<Pick<OltConfig, "host" | "snmpPort" | "telnetPort" | "boards">> = {};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required OLT environment variable: ${name}`);
  return value;
}

function configValue(name: "OLT_ZTE_HOST" | "OLT_ZTE_SNMP_PORT" | "OLT_ZTE_TELNET_PORT" | "OLT_ZTE_BOARDS") {
  const keys = { OLT_ZTE_HOST: "host", OLT_ZTE_SNMP_PORT: "snmpPort", OLT_ZTE_TELNET_PORT: "telnetPort", OLT_ZTE_BOARDS: "boards" } as const;
  return overrides[keys[name]] ?? requiredEnv(name);
}

export function getOltConfig(): OltConfig {
  return {
    host: String(configValue("OLT_ZTE_HOST")),
    snmpPort: Number(configValue("OLT_ZTE_SNMP_PORT")),
    telnetPort: Number(configValue("OLT_ZTE_TELNET_PORT")),
    boards: String(configValue("OLT_ZTE_BOARDS")),
    communityConfigured: Boolean(process.env.OLT_ZTE_SNMP_COMMUNITY),
    usernameConfigured: Boolean(process.env.OLT_ZTE_TELNET_USERNAME && process.env.OLT_ZTE_TELNET_PASSWORD),
  };
}

export function updateOltConfig(input: Pick<OltConfig, "host" | "snmpPort" | "telnetPort" | "boards">) {
  if (!/^([a-zA-Z0-9.-]+|\d{1,3}(\.\d{1,3}){3})$/.test(input.host)) throw new Error("Host/IP inválido");
  if (!Number.isInteger(input.snmpPort) || input.snmpPort < 1 || input.snmpPort > 65535) throw new Error("Porta SNMP inválida");
  if (!Number.isInteger(input.telnetPort) || input.telnetPort < 1 || input.telnetPort > 65535) throw new Error("Porta Telnet inválida");
  if (!/^\d+:\d+(,\d+:\d+)*$/.test(input.boards)) throw new Error("Slots devem usar o formato 8:8,9:16");
  Object.assign(overrides, input);
  cached = undefined;
  return getOltConfig();
}

type StateRow = { interfaceName: string; status: "online" | "offline" };

function parseBoards(value: string) {
  return value.split(",").map((entry) => {
    const [slot, pons] = entry.split(":").map(Number);
    return { slot, pons };
  });
}

export function parseOnuState(output: string): StateRow[] {
  const rows: StateRow[] = [];
  const rowPattern = /(\d+\/\d+\/\d+:\d+)\s+(enable|disable)\s+\S+\s+(working|offline|OffLine|DyingGasp|LOS)/gi;
  for (const match of Array.from(output.matchAll(rowPattern))) {
    rows.push({ interfaceName: match[1], status: match[3].toLowerCase() === "working" ? "online" : "offline" });
  }
  return rows;
}

export function parseOnuDetail(output: string) {
  const value = (label: string) => output.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "im"))?.[1]?.trim() ?? "";
  const distance = output.match(/ONU Distance:\s*(\d+)m/i)?.[1];
  const phase = value("Phase state").toLowerCase();
  const state = value("State").toLowerCase();
  return { name: value("Description") || value("Name") || "ONU sem descrição", serial: value("Serial number") || "—", distance: distance ? Number(distance) / 1000 : 0, uptime: value("Online Duration") || "—", profile: value("Type") || "GPON", online: phase === "working" || state === "ready" };
}

export function parseOnuPower(output: string) {
  const downstream = output.match(/down\s+Tx\s*:\s*(-?[\d.]+)\(dbm\)\s+Rx\s*:\s*(-?[\d.]+)/i);
  const upstream = output.match(/up\s+Rx\s*:\s*(-?[\d.]+)\(dbm\)/i);
  return Number(downstream?.[2] ?? upstream?.[1] ?? -35);
}

class TelnetSession {
  private socket: net.Socket;
  private buffer = "";
  private listeners: Array<(chunk: string) => void> = [];
  private constructor(socket: net.Socket) { this.socket = socket; socket.setEncoding("utf8"); socket.on("data", (chunk) => { const text = typeof chunk === "string" ? chunk : chunk.toString("utf8"); this.buffer += text; for (const listener of this.listeners) listener(text); }); }
  static async open() { const socket = await new Promise<net.Socket>((resolve, reject) => { const connection = net.createConnection({ host: String(configValue("OLT_ZTE_HOST")), port: Number(configValue("OLT_ZTE_TELNET_PORT")) }); connection.once("connect", () => resolve(connection)); connection.once("error", reject); }); const session = new TelnetSession(socket); await new Promise((resolve) => setTimeout(resolve, 500)); session.write(requiredEnv("OLT_ZTE_TELNET_USERNAME")); await new Promise((resolve) => setTimeout(resolve, 300)); session.write(requiredEnv("OLT_ZTE_TELNET_PASSWORD")); await new Promise((resolve) => setTimeout(resolve, 800)); return session; }
  private write(value: string) { this.socket.write(`${value}\r\n`); }
  async command(command: string) { const start = this.buffer.length; this.write(command); const deadline = Date.now() + 15000; while (Date.now() < deadline) { const output = this.buffer.slice(start); const clean = output.replace(/[\u0000\u001b\u007f]/g, ""); if (/--?More--/i.test(clean)) this.socket.write(" "); const stateRowsSeen = (clean.match(/\d+\/\d+\/\d+:\d+/g) ?? []).length; if (command === "show gpon onu state" && (stateRowsSeen >= 100 || /ONU Number:\s*\d+/i.test(clean))) return clean; if (/Confirm to reboot\?\s*\[yes\/no\]:/i.test(clean)) return clean; if (/[A-Za-z0-9._-]+[#>]\s*$/m.test(clean)) return clean; await new Promise((resolve) => setTimeout(resolve, 150)); } const timedOut = this.buffer.slice(start).replace(/[\u0000\u001b\u007f]/g, ""); if (command === "show gpon onu state" && /\d+\/\d+\/\d+:\d+/.test(timedOut)) return timedOut; throw new Error(`Telnet command timeout: ${command}`); }
  close() { this.socket.destroy(); }
}

function validateOnuId(onuId: string) { if (!/^\d+\/\d+\/\d+:\d+$/.test(onuId)) throw new Error("ONU identifier is invalid"); return onuId; }

export async function executeOperatorAction(action: OperatorAction, onuId: string) { const target = validateOnuId(onuId); const session = await TelnetSession.open(); try { await session.command("terminal length 0"); await session.command("config t"); if (action === "reboot") { await session.command(`pon-onu-mng gpon-onu_${target}`); await session.command("reboot"); await session.command("yes"); } else { await session.command(`interface gpon-onu_${target}`); await session.command(action === "disable" ? "shutdown" : "no shutdown"); await session.command("end"); } return { success: true as const, action, onuId: target, executedAt: Date.now() }; } finally { session.close(); } }

export async function updateOnuDescription(onuId: string, description: string) {
  const target = validateOnuId(onuId);
  const cleanDescription = description.trim();
  if (!cleanDescription || cleanDescription.length > 64 || /[\r\n;]/.test(cleanDescription)) throw new Error("Descrição inválida (1 a 64 caracteres)");
  const session = await TelnetSession.open();
  try {
    await session.command("terminal length 0");
    await session.command("config t");
    await session.command(`interface gpon-onu_${target}`);
    await session.command(`name ${cleanDescription}`);
    await session.command("end");
    detailCache.delete(target);
    cached = undefined;
    return { success: true as const, onuId: target, description: cleanDescription, updatedAt: Date.now() };
  } finally { session.close(); }
}

async function readSystemName() { const session = snmp.createSession(String(configValue("OLT_ZTE_HOST")), requiredEnv("OLT_ZTE_SNMP_COMMUNITY"), { port: Number(configValue("OLT_ZTE_SNMP_PORT")), version: snmp.Version2c, timeout: 3000, retries: 0 }); return new Promise<string>((resolve) => { session.get(["1.3.6.1.2.1.1.5.0"], (error: Error | null, varbinds: Array<{ value: unknown }>) => { session.close(); resolve(error ? "CHAPARRAL-C300" : String(varbinds[0]?.value ?? "CHAPARRAL-C300")); }); }); }

let cached: { expiresAt: number; value: LiveOltSnapshot } | undefined;
let snapshotInFlight: Promise<LiveOltSnapshot> | undefined;
let detailInFlight: Promise<void> | undefined;
const detailCache = new Map<string, ReturnType<typeof parseOnuDetail> & { signal: number; status: LiveONU["status"] }>();
let detailCursor = 0;

function startDetailEnrichment(rows: StateRow[]) {
  if (detailInFlight) return;
  const pending = rows.filter((row) => !detailCache.has(row.interfaceName)).sort((a, b) => Number(b.status === "online") - Number(a.status === "online"));
  const batch = Array.from({ length: Math.min(8, pending.length) }, (_, index) => pending[(detailCursor + index) % pending.length]).filter(Boolean);
  if (!batch.length) return;
  detailCursor = (detailCursor + batch.length) % Math.max(pending.length, 1);
  detailInFlight = (async () => {
    const session = await TelnetSession.open();
    try {
      await session.command("terminal length 0");
      for (const row of batch) {
        try {
          const detail = parseOnuDetail(await session.command(`show gpon onu detail-info gpon-onu_${row.interfaceName}`));
          const signal = parseOnuPower(await session.command(`show pon power attenuation gpon-onu_${row.interfaceName}`));
          const status = row.status === "online" && detail.online ? (signal < -27 ? "alerta" : "online") : "offline";
          detailCache.set(row.interfaceName, { ...detail, signal, status });
        } catch (error) { console.warn(`[OLT] detail enrichment skipped for ${row.interfaceName}:`, error); }
      }
    } finally { session.close(); }
  })().finally(() => { detailInFlight = undefined; cached = undefined; });
}

export async function getLiveOltSnapshot(): Promise<LiveOltSnapshot> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (snapshotInFlight) return snapshotInFlight;
  snapshotInFlight = (async () => {
    const session = await TelnetSession.open();
    try {
      await session.command("terminal length 0");
      const stateRows = parseOnuState(await session.command("show gpon onu state"));
      const allowedSlots = new Set(parseBoards(String(configValue("OLT_ZTE_BOARDS"))).map((board) => board.slot));
      const filteredRows = stateRows.filter((row) => allowedSlots.has(Number(row.interfaceName.split("/")[1])));
      const onus = filteredRows.map((row) => {
        const detail = detailCache.get(row.interfaceName);
        const status = detail ? (row.status === "offline" ? "offline" : detail.status) : row.status;
        return { id: row.interfaceName, serial: detail?.serial ?? "—", mac: "não informado", name: detail?.name ?? `ONU ${row.interfaceName}`, slot: row.interfaceName, status, signal: detail?.signal ?? -99, distance: detail?.distance ?? 0, uptime: detail?.uptime ?? "—", lastEvent: status === "offline" ? "ONU offline" : status === "alerta" ? "RX baixo" : detail ? "Sem alarmes" : "Aguardando leitura detalhada", profile: detail?.profile ?? "GPON" };
      });
      const value: LiveOltSnapshot = { connected: true, host: String(configValue("OLT_ZTE_HOST")), model: "ZTE C300", hostname: await readSystemName(), transport: "SNMP v2c + Telnet", source: "real", syncedAt: Date.now(), onus };
      cached = { expiresAt: Date.now() + 12000, value };
      setTimeout(() => startDetailEnrichment(filteredRows), 250);
      return value;
    } finally { session.close(); }
  })();
  try { return await snapshotInFlight; } finally { snapshotInFlight = undefined; }
}
