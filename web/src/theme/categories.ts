export const FALLBACK: Record<string, { emoji: string; color: string }> = {
  food: { emoji: "🍛", color: "#B02E0C" }, travel: { emoji: "🚌", color: "#2B6CB0" },
  savings: { emoji: "🐖", color: "#C43A8A" }, church: { emoji: "⛪", color: "#8B5CF6" },
  investments: { emoji: "📈", color: "#AC8112" }, income: { emoji: "💰", color: "#1B7F4B" },
  transfer: { emoji: "🔁", color: "#607468" },
};
export const CATEGORY_FALLBACK = { emoji: "🧾", color: "#607468" };

export function categoryStyle(cat?: { emoji?: string; color?: string; name?: string } | null) {
  if (cat?.emoji && cat?.color) return { emoji: cat.emoji, color: cat.color };
  return (cat?.name && FALLBACK[cat.name]) || CATEGORY_FALLBACK;
}
