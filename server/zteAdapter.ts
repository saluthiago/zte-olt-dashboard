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

type StateRow = { interfaceName: string; status: "online" | "offline" };

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required OLT environment variable: ${name}`);
  return value;
}

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
  return {
    name: value("Description") || value("Name") || "ONU sem descrição",
    serial: value("Serial number") || "—",
    distance: distance ? Number(distance) / 1000 : 0,
    uptime: value("Online Duration") || "—",
    profile: value("Type") || "GPON",
    online: phase === "working" || state === "ready",
  };
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

  private constructor(socket: net.Socket) {
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      this.buffer += text;
      for (const listener of this.listeners) listener(text);
    });
  }

  static async open() {
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const connection = net.createConnection({ host: requiredEnv("OLT_ZTE_HOST"), port: Number(requiredEnv("OLT_ZTE_TELNET_PORT")) });
      connection.once("connect", () => resolve(connection));
      connection.once("error", reject);
    });
    const session = new TelnetSession(socket);
    await new Promise((resolve) => setTimeout(resolve, 500));
    session.write(requiredEnv("OLT_ZTE_TELNET_USERNAME"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    session.write(requiredEnv("OLT_ZTE_TELNET_PASSWORD"));
    await new Promise((resolve) => setTimeout(resolve, 800));
    return session;
  }

  private write(value: string) {
    this.socket.write(`${value}\r\n`);
  }

  private waitFor(pattern: RegExp, timeoutMs = 10000) {
    if (pattern.test(this.buffer)) return Promise.resolve(this.buffer);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((listener) => listener !== onData);
        reject(new Error(`Telnet prompt timeout: ${pattern}`));
      }, timeoutMs);
      const onData = () => {
        if (!pattern.test(this.buffer)) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((listener) => listener !== onData);
        resolve(this.buffer);
      };
      this.listeners.push(onData);
    });
  }

  async command(command: string) {
    const start = this.buffer.length;
    this.write(command);
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const output = this.buffer.slice(start);
      const clean = output.replace(/[\u0000-\u001f\u007f]/g, "");
      if (/--?More--|More/i.test(clean)) this.socket.write(" ");
      if (/[A-Za-z0-9._-]+[#>]\s*$/m.test(clean)) return clean;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Telnet command timeout: ${command}`);
  }

  close() {
    this.socket.destroy();
  }
}

async function readSystemName() {
  const host = requiredEnv("OLT_ZTE_HOST");
  const community = requiredEnv("OLT_ZTE_SNMP_COMMUNITY");
  const port = Number(requiredEnv("OLT_ZTE_SNMP_PORT"));
  return new Promise<string>((resolve) => {
    const session = snmp.createSession(host, community, { port, version: snmp.Version2c, timeout: 3000, retries: 0 });
    session.get(["1.3.6.1.2.1.1.5.0"], (error: Error | null, varbinds: Array<{ value: unknown }>) => {
      session.close();
      resolve(error ? "CHAPARRAL-C300" : String(varbinds[0]?.value ?? "CHAPARRAL-C300"));
    });
  });
}

let cached: { expiresAt: number; value: LiveOltSnapshot } | undefined;

export async function getLiveOltSnapshot(): Promise<LiveOltSnapshot> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const session = await TelnetSession.open();
  try {
    await session.command("terminal length 0");
    const stateOutput = await session.command("show gpon onu state");
    const stateRows = parseOnuState(stateOutput);
    const boards = parseBoards(requiredEnv("OLT_ZTE_BOARDS"));
    const allowedSlots = new Set(boards.map((board) => board.slot));
    const filteredRows = stateRows.filter((row) => allowedSlots.has(Number(row.interfaceName.split("/")[1])));
    const onus: LiveONU[] = [];

    // Primeiro ciclo conservador: enriquece apenas uma janela de ONUs para não gerar
    // uma rajada de comandos Telnet em uma OLT com centenas de assinantes.
    for (const row of filteredRows.slice(0, 12)) {
      const detailOutput = await session.command(`show gpon onu detail-info gpon-onu_${row.interfaceName}`);
      const powerOutput = await session.command(`show pon power attenuation gpon-onu_${row.interfaceName}`);
      const detail = parseOnuDetail(detailOutput);
      const status = row.status === "online" && detail.online ? (parseOnuPower(powerOutput) < -27 ? "alerta" : "online") : "offline";
      onus.push({
        id: row.interfaceName,
        serial: detail.serial,
        mac: "não informado",
        name: detail.name,
        slot: row.interfaceName,
        status,
        signal: parseOnuPower(powerOutput),
        distance: detail.distance,
        uptime: detail.uptime,
        lastEvent: status === "offline" ? "ONU offline" : status === "alerta" ? "RX baixo" : "Sem alarmes",
        profile: detail.profile,
      });
    }
    for (const row of filteredRows.slice(12)) {
      onus.push({
        id: row.interfaceName,
        serial: "—",
        mac: "não informado",
        name: `ONU ${row.interfaceName}`,
        slot: row.interfaceName,
        status: row.status,
        signal: -99,
        distance: 0,
        uptime: "—",
        lastEvent: row.status === "offline" ? "ONU offline" : "Aguardando leitura detalhada",
        profile: "GPON",
      });
    }

    const value: LiveOltSnapshot = { connected: true, host: requiredEnv("OLT_ZTE_HOST"), model: "ZTE C300", hostname: await readSystemName(), transport: "SNMP v2c + Telnet", source: "real", syncedAt: Date.now(), onus };
    cached = { expiresAt: Date.now() + 12000, value };
    return value;
  } finally {
    session.close();
  }
}
