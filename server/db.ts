import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, operatorAccounts, operationLogs } from "../drizzle/schema";
import { hashOperatorPassword } from "./localAuth";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.


export async function listOperatorAccounts() { const db = await getDb(); if (!db) return []; return db.select({ id: operatorAccounts.id, name: operatorAccounts.name, email: operatorAccounts.email, username: operatorAccounts.username, role: operatorAccounts.role, createdAt: operatorAccounts.createdAt }).from(operatorAccounts).orderBy(desc(operatorAccounts.createdAt)); }
export async function saveOperatorAccount(input: { id?: number; name: string; email?: string; username: string; passwordHash?: string; role: "tecnico"|"operador"|"admin" }) { const db = await getDb(); if (!db) throw new Error("Banco de dados indisponível"); if (input.id) { const update: Record<string, unknown> = { name: input.name, email: input.email || null, username: input.username, role: input.role }; if (input.passwordHash) update.passwordHash = input.passwordHash; await db.update(operatorAccounts).set(update).where(eq(operatorAccounts.id, input.id)); return input.id; } const result = await db.insert(operatorAccounts).values({ name: input.name, email: input.email || null, username: input.username, passwordHash: input.passwordHash || "", role: input.role }); return Number(result[0].insertId); }
export async function deleteOperatorAccount(id: number) { const db = await getDb(); if (!db) throw new Error("Banco de dados indisponível"); await db.delete(operatorAccounts).where(eq(operatorAccounts.id, id)); return { success: true }; }
export async function listOperationLogs(limit = 100) { const db = await getDb(); if (!db) return []; return db.select().from(operationLogs).orderBy(desc(operationLogs.createdAt)).limit(limit); }
export async function insertOperationLog(input: { action: string; onu?: string; operatorOpenId?: string; operatorName?: string; commands: string[] }) { const db = await getDb(); if (!db) throw new Error("Banco de dados indisponível"); await db.insert(operationLogs).values(input); return { success: true }; }

export async function getOperatorByUsername(username: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(operatorAccounts).where(eq(operatorAccounts.username, username)).limit(1); return result[0]; }
export async function ensureInitialOperator() { const username = process.env.OLT_ADMIN_USERNAME?.trim(); const password = process.env.OLT_ADMIN_PASSWORD; if (!username || !password) return; const existing = await getOperatorByUsername(username); if (existing) return; const db = await getDb(); if (!db) return; await db.insert(operatorAccounts).values({ name: process.env.OLT_ADMIN_NAME?.trim() || "Administrador", username, email: process.env.OLT_ADMIN_EMAIL?.trim() || null, passwordHash: hashOperatorPassword(password), role: "admin" }); console.log(`[Auth] Usuário administrador inicial criado: ${username}`); }
