/**
 * Phase 1C compatibility shim: the v1 Android app keeps talking to POST/GET /api/transactions
 * with the old bearer token until Phase 1D ships login. Every write is translated into a v2
 * push in LEGACY_SPACE_ID, captured by that space's owner. Removed in Phase 1D.
 */
import { timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { categories, member, transactions } from "../db/schema.js";
import type { Env } from "../env.js";
import { resolveCategoryByName } from "../services/categories.js";
import { pushChanges } from "../services/sync.js";

const LEGACY_NS = "6ba7b811-9dad-11d1-80b4-00c04fd430c8"; // uuid v5 URL namespace
export const legacyTxId = (spaceId: string, txnId: string, direction: string) => uuidv5(`wallet-legacy/${spaceId}/${txnId}/${direction}`, LEGACY_NS);

const legacyIn = z.object({
  transaction_id: z.string().min(1),
  amount: z.number().positive(),
  direction: z.enum(["in", "out", "transfer"]),
  source: z.enum(["mpesa", "airtel"]),
  counterparty: z.string(),
  date_time: z.string().min(1),
  balance: z.number().default(0),
  cost: z.number().min(0).default(0),
  category: z.string().min(1),
  reason: z.string().default(""),
});
export const toCents = (n: number) => Math.round(n * 100);

function tokenOk(header: string | undefined, expected: string) {
  const got = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function legacyRoutes(db: Db, env: Pick<Env, "LEGACY_API_TOKEN" | "LEGACY_SPACE_ID">) {
  const r = new Hono();
  r.use("*", async (c, next) => {
    if (!env.LEGACY_API_TOKEN || !env.LEGACY_SPACE_ID) return c.json({ error: "shim_unconfigured" }, 503);
    if (!tokenOk(c.req.header("authorization"), env.LEGACY_API_TOKEN)) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  r.post("/", async (c) => {
    const spaceId = env.LEGACY_SPACE_ID!;
    const p = legacyIn.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: "invalid", message: p.error.issues[0]?.message }, 400);
    const w = p.data;
    const occurred = new Date(w.date_time);
    if (Number.isNaN(occurred.getTime())) return c.json({ error: "invalid", message: "date_time" }, 400);
    const [owner] = await db.select({ userId: member.userId }).from(member).where(and(eq(member.organizationId, spaceId), eq(member.role, "owner"))).limit(1);
    if (!owner) return c.json({ error: "shim_unconfigured", message: "legacy space has no owner" }, 503);
    const categoryId = await resolveCategoryByName(db, spaceId, w.category);
    const reason = w.reason.trim() || null;
    // Exact duplicate of what is already stored → 200 without touching the row (v1 semantics).
    const [existing] = await db.select().from(transactions).where(and(
      eq(transactions.spaceId, spaceId), eq(transactions.source, w.source), eq(transactions.receiptCode, w.transaction_id), eq(transactions.direction, w.direction),
    )).limit(1);
    if (existing && existing.categoryId === categoryId && (existing.reason ?? null) === reason) return c.json({ created: false });
    const res = await pushChanges(db, { spaceId, userId: owner.userId }, { transactions: [{
      id: legacyTxId(spaceId, w.transaction_id, w.direction), source: w.source, receipt_code: w.transaction_id, direction: w.direction,
      amount_cents: toCents(w.amount), cost_cents: toCents(w.cost), balance_cents: w.balance ? toCents(w.balance) : null,
      counterparty: w.counterparty, occurred_at: occurred.toISOString(), category_id: categoryId, reason,
      client_updated_at: new Date().toISOString(), deleted_at: null,
    }] });
    const result = res.results[0];
    if (!result || result.status === "rejected") return c.json({ error: result?.error ?? "rejected", message: result?.message }, 400);
    c.header("Content-Type", "application/json");
    return c.json({ created: !existing }, existing ? 200 : 201);
  });

  r.get("/", async (c) => {
    const spaceId = env.LEGACY_SPACE_ID!;
    const rows = await db.select({ t: transactions, catName: categories.name }).from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(eq(transactions.spaceId, spaceId), isNull(transactions.deletedAt))).orderBy(asc(transactions.occurredAt));
    return c.json(rows.map(({ t, catName }) => ({
      transaction_id: t.receiptCode ?? t.id, amount: t.amountCents / 100, direction: t.direction, source: t.source === "manual" ? "mpesa" : t.source,
      counterparty: t.counterparty, date_time: t.occurredAt.toISOString(), balance: (t.balanceCents ?? 0) / 100, cost: t.costCents / 100,
      category: catName ?? "", reason: t.reason ?? "",
    })));
  });
  return r;
}
