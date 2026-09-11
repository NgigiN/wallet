ALTER TABLE "budgets" ADD CONSTRAINT "budgets_limit_positive" CHECK ("budgets"."monthly_limit_cents" > 0);--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_kind_chk" CHECK ("categories"."kind" in ('expense','income','transfer'));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_cents" > 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cost_nonneg" CHECK ("transactions"."cost_cents" >= 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_direction_chk" CHECK ("transactions"."direction" in ('in','out','transfer'));