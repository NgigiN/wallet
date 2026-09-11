import type { Auth } from "../auth.js";

// The personal space is created in two places — the sign-up hook in auth.ts and the
// self-heal in GET /spaces when a user somehow has none — and both must build the same
// organization, in particular the same `metadata.kind` that spaceKind() reads back.
export function createPersonalSpace(auth: Auth, userId: string) {
  return auth.api.createOrganization({
    body: {
      name: "Personal",
      slug: `personal-${userId.toLowerCase()}`,
      userId,
      metadata: { kind: "personal" },
    },
  });
}
