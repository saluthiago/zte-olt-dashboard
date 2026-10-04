import { describe, expect, it } from "vitest";
import { hashOperatorPassword } from "./routers";

describe("operator account password storage", () => {
  it("stores a salted scrypt digest instead of the clear password", () => {
    const password = "Senha-Forte-2026!";
    const first = hashOperatorPassword(password);
    const second = hashOperatorPassword(password);

    expect(first).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(first).not.toContain(password);
    expect(second).not.toBe(first);
  });
});
