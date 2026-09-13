#!/usr/bin/env python3
"""Export the v1 Go SQLite transactions table to JSON for server/src/scripts/import-json.ts.
Usage: export-sqlite.py <transaction.db> <out.json>   (Python stdlib only; run anywhere the file is readable)."""
import json, sqlite3, sys
from datetime import datetime

src, out = sys.argv[1], sys.argv[2]
c = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
c.row_factory = sqlite3.Row
rows = []
for r in c.execute("select * from transactions where deleted_at is null order by date_time, id"):
    def iso(v):
        if v is None: return None
        s = str(v).replace(" ", "T", 1)
        return datetime.fromisoformat(s).isoformat()
    rows.append({
        "transaction_id": r["transaction_id"], "amount": r["amount"], "counterparty": r["recipient"], "date_time": iso(r["date_time"]),
        "balance": r["balance"], "cost": r["cost"], "category": r["category"], "reason": r["reason"],
        "direction": r["direction"] or "", "source": r["source"] or "", "updated_at": iso(r["updated_at"]), "created_at": iso(r["created_at"]),
    })
json.dump(rows, open(out, "w"), indent=0)
tot_out = sum(x["amount"] for x in rows if (x["direction"] or "out") == "out")
tot_in = sum(x["amount"] for x in rows if x["direction"] == "in")
print(json.dumps({"rows": len(rows), "sum_out": round(tot_out, 2), "sum_in": round(tot_in, 2)}))
