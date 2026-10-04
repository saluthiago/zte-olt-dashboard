import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here

export const operatorAccounts = mysqlTable("operator_accounts", { id: int("id").autoincrement().primaryKey(), name: varchar("name", { length: 160 }).notNull(), email: varchar("email", { length: 320 }), username: varchar("username", { length: 80 }).notNull().unique(), passwordHash: varchar("passwordHash", { length: 255 }).notNull(), role: mysqlEnum("role", ["tecnico", "operador", "admin"]).default("tecnico").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() });
export const operationLogs = mysqlTable("operation_logs", { id: int("id").autoincrement().primaryKey(), action: varchar("action", { length: 80 }).notNull(), onu: varchar("onu", { length: 80 }), operatorOpenId: varchar("operatorOpenId", { length: 64 }), operatorName: varchar("operatorName", { length: 160 }), commands: json("commands").$type<string[]>().notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() });
