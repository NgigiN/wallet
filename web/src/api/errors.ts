export const ERROR_COPY: Record<string, string> = {
  unauthorized: "Please sign in again.",
  forbidden: "You don't have access to that space.",
  not_found: "That no longer exists.",
  rate_limited: "Too many requests. Try again in a minute.",
  upgrade_required: "This version of Wallet is too old. Reload to update.",
  batch_too_large: "Too many changes at once. Syncing in smaller batches.",
  network: "You're offline. Changes are saved and will sync later.",
  invalid: "That doesn't look right.",
  conflict: "That already exists.",
  // Per-row push rejections (server/src/services/sync.ts).
  system_category: "Built-in categories can't be changed that way.",
  id_conflict: "This item collided with one from another space. Re-create it.",
  duplicate_name: "A category with that name already exists.",
  duplicate_budget: "That category already has a budget.",
  duplicate_rule: "A rule for that counterparty already exists.",
  immutable: "Parsed transaction details can't be edited; only the category and note.",
  bad_category: "That category no longer exists — pick another.",
};
export const copyFor = (code: string, fallback = "Something went wrong.") => ERROR_COPY[code] ?? fallback;
