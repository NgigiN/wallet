import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { categories, member, organization, spaceSettings } from "../src/db/schema.js";
import { seedCategories } from "../src/services/categories.js";
import { makeApp, testDb } from "./setup.js";
import { signUp } from "./helpers.js";

describe("personal space", () => {
  it("creates one personal space with 7 seeded categories on sign-up", async () => {
    const app = makeApp();
    const { userId } = await signUp(app, "p@example.com");

    const memberships = await testDb.select().from(member).where(eq(member.userId, userId));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("owner");

    const [org] = await testDb.select().from(organization).where(eq(organization.id, memberships[0].organizationId));
    expect(JSON.parse(org.metadata as string).kind).toBe("personal");

    const cats = await testDb.select().from(categories).where(eq(categories.spaceId, org.id));
    expect(cats.map((c) => c.name).sort()).toEqual(["church", "food", "income", "investments", "savings", "transfer", "travel"]);
    expect(cats.find((c) => c.name === "income")!.kind).toBe("income");
    expect(cats.find((c) => c.name === "transfer")!.isSystem).toBe(true);
    expect(cats.find((c) => c.name === "food")!.emoji).toBe("🍛");

    const settings = await testDb.select().from(spaceSettings).where(eq(spaceSettings.spaceId, org.id));
    expect(settings[0].timezone).toBe("Africa/Nairobi");
  });

  it("is idempotent: reseeding an existing space leaves exactly 7 categories and 1 settings row", async () => {
    const app = makeApp();
    const { userId } = await signUp(app, "idempotent@example.com");
    const [membership] = await testDb.select().from(member).where(eq(member.userId, userId));
    const spaceId = membership.organizationId;

    await seedCategories(testDb, spaceId);

    const cats = await testDb.select().from(categories).where(eq(categories.spaceId, spaceId));
    expect(cats).toHaveLength(7);

    const settings = await testDb.select().from(spaceSettings).where(eq(spaceSettings.spaceId, spaceId));
    expect(settings).toHaveLength(1);
  });
});
