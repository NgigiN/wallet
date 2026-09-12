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
};
export const copyFor = (code: string, fallback = "Something went wrong.") => ERROR_COPY[code] ?? fallback;
