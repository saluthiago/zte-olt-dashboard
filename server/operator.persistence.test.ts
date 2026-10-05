import { describe, expect, it } from "vitest";
import { createLocalSession, hashOperatorPassword, readLocalSession, verifyOperatorPassword } from "./localAuth";

describe("local operator authentication", () => {
  it("stores a salted scrypt digest instead of the clear password", () => {
    const password = "Senha-Forte-2026!";
    const first = hashOperatorPassword(password);
    const second = hashOperatorPassword(password);
    expect(first).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(first).not.toContain(password);
    expect(second).not.toBe(first);
  });

  it("verifies the correct password and rejects an incorrect one", () => {
    const hash = hashOperatorPassword("Senha-Forte-2026!");
    expect(verifyOperatorPassword("Senha-Forte-2026!", hash)).toBe(true);
    expect(verifyOperatorPassword("senha-errada", hash)).toBe(false);
  });

  it("creates and validates a signed local session", () => {
    const token = createLocalSession({ id: 7, openId: "local:admin", username: "admin", name: "Administrador", role: "admin" }, "test-secret");
    expect(readLocalSession(token, "test-secret")?.username).toBe("admin");
    expect(readLocalSession(token, "wrong-secret")).toBeNull();
  });
});
