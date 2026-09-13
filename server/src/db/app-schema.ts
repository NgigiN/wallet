import { sql } from "drizzle-orm";
import {
  bigint, boolean, check, index, integer, pgSequence, pgTable, smallint, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema.js";

export const changeSeq = pgSequence("change_seq");

const syncColumns = {
  seq: bigint("seq", { mode: "number" }).notNull().default(sql`nextval('change_seq')`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  clientUpdatedAt: timestamp("client_updated_at", { withTimezone: true }).notNull(),
};

export const spaceSettings = pgTable("space_settings", {
  spaceId: text("space_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Africa/Nairobi"),
  weekStartsOn: smallint("week_starts_on").notNull().default(1),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["expense", "income", "transfer"] }).notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
  isSystem: boolean("is_system").notNull().default(false),
  ...syncColumns,
}, (t) => [
  uniqueIndex("categories_space_name_uq").on(t.spaceId, sql`lower(${t.name})`).where(sql`${t.deletedAt} is null`),
  index("categories_space_seq_idx").on(t.spaceId, t.seq),
  // The column's TS enum is a compile-time fiction over a plain `text` column; this is what
  // stops a bad value reaching the table through a raw query or a future code path.
  check("categories_kind_chk", sql`${t.kind} in ('expense','income','transfer')`),
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  capturedBy: text("captured_by").references(() => user.id, { onDelete: "set null" }),
  source: text("source").notNull(),
  receiptCode: text("receipt_code"),
  direction: text("direction", { enum: ["in", "out", "transfer"] }).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  costCents: bigint("cost_cents", { mode: "number" }).notNull().default(0),
  balanceCents: bigint("balance_cents", { mode: "number" }),
  counterparty: text("counterparty").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  reason: text("reason"),
  linkedTransactionId: uuid("linked_transaction_id"),
  ...syncColumns,
}, (t) => [
  uniqueIndex("transactions_dedupe_uq").on(t.spaceId, t.source, t.receiptCode, t.direction).where(sql`${t.receiptCode} is not null`),
  index("transactions_space_seq_idx").on(t.spaceId, t.seq),
  index("transactions_space_occurred_idx").on(t.spaceId, t.occurredAt),
  index("transactions_space_category_idx").on(t.spaceId, t.categoryId, t.occurredAt),
  // Money invariants enforced in the database as well as in mergeTransaction: a zero or
  // negative amount, a negative cost, or an unknown direction is corruption, not data.
  check("transactions_amount_positive", sql`${t.amountCents} > 0`),
  check("transactions_cost_nonneg", sql`${t.costCents} >= 0`),
  check("transactions_direction_chk", sql`${t.direction} in ('in','out','transfer')`),
]);

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  monthlyLimitCents: bigint("monthly_limit_cents", { mode: "number" }).notNull(),
  ...syncColumns,
}, (t) => [
  uniqueIndex("budgets_space_category_uq").on(t.spaceId, t.categoryId).where(sql`${t.deletedAt} is null`),
  index("budgets_space_seq_idx").on(t.spaceId, t.seq),
  check("budgets_limit_positive", sql`${t.monthlyLimitCents} > 0`),
]);

export const budgetAlerts = pgTable("budget_alerts", {
  spaceId: text("space_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull(),
  month: text("month").notNull(), // YYYY-MM in space timezone
  levelSent: smallint("level_sent").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("budget_alerts_uq").on(t.spaceId, t.categoryId, t.month, t.levelSent)]);

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey(),
  spaceId: text("space_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  matchCounterparty: text("match_counterparty").notNull(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  ...syncColumns,
}, (t) => [
  uniqueIndex("rules_space_match_uq").on(t.spaceId, t.matchCounterparty).where(sql`${t.deletedAt} is null`),
  index("rules_space_seq_idx").on(t.spaceId, t.seq),
]);

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  platform: text("platform", { enum: ["android", "web"] }).notNull(),
  name: text("name").notNull(),
  appVersion: text("app_version").notNull(),
  pushToken: text("push_token"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
