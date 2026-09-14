import net from "node:net";
import { describe, expect, it } from "vitest";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required OLT secret: ${name}`);
  return value;
}

function readTelnetCommand(command: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: env("OLT_ZTE_HOST"), port: Number(env("OLT_ZTE_TELNET_PORT")) });
    let output = "";
    let stage: "login" | "password" | "ready" | "command" = "login";
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Telnet inventory probe timed out")); }, 15000);
    const finish = () => { clearTimeout(timer); socket.destroy(); resolve(output); };

    socket.on("data", (chunk) => {
      const text = chunk.toString("utf8").replace(/[\u0000\u001b]/g, "");
      output += text;
      const lower = output.toLowerCase();
      if (stage === "login" && /(login|username|user name)\s*[:>]?\s*$/i.test(output)) {
        socket.write(`${env("OLT_ZTE_TELNET_USERNAME")}\r\n`);
        stage = "password";
        setTimeout(() => {
          if (stage === "password") {
            socket.write(`${env("OLT_ZTE_TELNET_PASSWORD")}\r\n`);
            stage = "ready";
            setTimeout(() => {
              if (stage === "ready") {
                socket.write(`${command}\r\n`);
                stage = "command";
              }
            }, 500);
          }
        }, 300);
        return;
      }
      if (stage === "password" && /password\s*[:>]?\s*$/i.test(output)) {
        socket.write(`${env("OLT_ZTE_TELNET_PASSWORD")}\r\n`);
        stage = "ready";
        return;
      }
      if (stage === "ready" && /(^|\s)(zte|gpon|olt|ras|[a-z0-9_-]+[#>])\s*$/im.test(output)) { socket.write(`${command}\r\n`); stage = "command"; return; }
      if (stage === "command" && (output.split(/\r?\n/).length > 8 || /(onuindex|onu id|invalid|error|total)/i.test(lower))) finish();
    });
    socket.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

describe.skipIf(process.env.OLT_RUN_LIVE_TESTS !== "1")("ZTE OLT ONU inventory", () => {
  it("reads the ONU state table without modifying the OLT", async () => {
    const output = await readTelnetCommand("show gpon onu state");
    console.log("OLT_ONU_STATE_BEGIN\n" + output.slice(-12000) + "\nOLT_ONU_STATE_END");
    expect(output.toLowerCase()).not.toContain("authentication failed");
    expect(output.length).toBeGreaterThan(40);
  }, 20000);
});
