export const budgetLevel = (spend: number, limit: number): 0 | 1 | 2 => (limit <= 0 ? 0 : spend >= limit ? 2 : spend >= 0.8 * limit ? 1 : 0);
export const budgetProgress = (spend: number, limit: number) => ({ fraction: limit <= 0 ? 0 : Math.min(1, spend / limit), level: budgetLevel(spend, limit) });
