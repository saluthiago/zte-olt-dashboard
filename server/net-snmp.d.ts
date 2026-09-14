declare module "net-snmp" {
  export const Version2c: number;
  export function createSession(host: string, community: string, options: { port: number; version: number; timeout: number; retries: number }): {
    get(oids: string[], callback: (error: Error | null, varbinds: Array<{ value: unknown }>) => void): void;
    close(): void;
  };
  const snmp: { Version2c: number; createSession: typeof createSession };
  export default snmp;
}
