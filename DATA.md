# Daily intel dump (Grok Bot → this repo)

From 2026-10-20 onward, after each research scrape, Grok Bot (私人助理) pushes **only data**, not website UI:

```
data/YYYY-MM-DD.json
```

## Item fields (required)

| field | notes |
|-------|--------|
| `date` | `YYYY-MM-DD` Asia/Kuala_Lumpur biz date |
| `section` | `marketing` or `product` |
| `title` | short headline |
| `url` | source link when available (may be empty) |
| `source` | platform or pipeline name |
| `summary` | one-paragraph understanding / why it matters |
| `tags` | string array (brand, status, category, …) |

Extra keys may appear until Claude Code freezes the schema. Website code (`index.html`, `js/`, etc.) is **owned by Claude Code** — Grok Bot must not edit those files after the initial handoff commit.

## Delivery

- Do **not** post long reports to the marketing group.
- Push the JSON into this private repo; Claude Code / dashboard reads from here.
