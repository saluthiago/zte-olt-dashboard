import net from "node:net";
import { describe, expect, it } from "vitest";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required OLT secret: ${name}`);
  return value;
}

function telnetReadOnlyProbe() {
  const host = requiredEnv("OLT_ZTE_HOST");
  const port = Number(requiredEnv("OLT_ZTE_TELNET_PORT"));
  const username = requiredEnv("OLT_ZTE_TELNET_USERNAME");
  const password = requiredEnv("OLT_ZTE_TELNET_PASSWORD");

  return new Promise<{ ok: boolean; detail: string }>((resolve) => {
    const socket = net.createConnection({ host, port });
    let buffer = "";
    let stage: "login" | "password" | "command" | "done" = "login";
    let settled = false;

    const finish = (result: { ok: boolean; detail: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, detail: "Telnet probe timed out" }), 8000);

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8").replace(/[\u0000-\u001f\u007f]/g, " ");
      const lower = buffer.toLowerCase();

      if (stage === "login" && /(login|username|user name)\s*[:>]?\s*$/i.test(buffer)) {
        socket.write(`${username}\r\n`);
        stage = "password";
        return;
      }
      if (stage === "password" && /password\s*[:>]?\s*$/i.test(buffer)) {
        socket.write(`${password}\r\n`);
        stage = "command";
        return;
      }
      if (stage === "command" && /(incorrect|invalid|failed|denied|authentication error)/i.test(lower)) {
        clearTimeout(timer);
        finish({ ok: false, detail: "Telnet credentials rejected" });
        return;
      }
      if (stage === "command" && /(^|\s)(zte|gpon|olt|ras|[a-z0-9_-]+[#>])\s*$/im.test(buffer)) {
        socket.write("show version\r\n");
        stage = "done";
        return;
      }
      if (stage === "done" && /(zte|c300|version|system)/i.test(buffer)) {
        clearTimeout(timer);
        finish({ ok: true, detail: "Authenticated Telnet session and read-only command accepted" });
      }
    });

    socket.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, detail: error.message });
    });
  });
}

describe.skipIf(process.env.OLT_RUN_LIVE_TESTS !== "1")("ZTE OLT protected connection", () => {
  it("authenticates Telnet and accepts a read-only show command", async () => {
    const result = await telnetReadOnlyProbe();
    expect(result.ok, result.detail).toBe(true);
  }, 12000);
});
