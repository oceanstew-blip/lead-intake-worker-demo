# Lead Intake Worker (Cloudflare Workers + D1 demo)

A small lead-intake API for a service-business website form. It validates what comes in, saves clean records to a database, and rejects bad input with clear errors.

**This is a demonstration project, not a production system.** It runs locally with fictional data. It sends no email or messages and connects to no outside service.

## The business problem

A contact form that posts straight into a spreadsheet or inbox collects whatever people type, including blank names, broken emails, pasted spam and the occasional bot. The business then cleans up after it, or misses a real lead buried in the junk. The form needs a small, dependable doorway that checks what comes in before anything is saved.

## What it does

| Endpoint | What it does |
|---|---|
| `GET /health` | Returns `{"ok": true}`. |
| `POST /api/leads` | Public. Validates and cleans the submission, saves it, returns `201` with the new id. |
| `GET /api/leads` | Private. Returns the latest 50 leads. Needs `Authorization: Bearer <ADMIN_TOKEN>`. |

**Validation and handling on `POST /api/leads`**

- Requires `Content-Type: application/json` (`415` otherwise).
- Rejects bodies over 10 KB (`413`) and invalid JSON (`400`).
- Checks each field and returns every problem at once with a `422`, for example `{"errors": {"email": "Enter a valid email address."}}`.
- Cleans the input: trims and collapses whitespace, removes control characters, lowercases the email, normalizes the phone number.
- Fields: `name`, `email`, `service`, `message` (10 to 2,000 characters), and an optional `phone`.
- A hidden `company_site` field acts as a honeypot. If it is filled in, the Worker answers as if it succeeded and saves nothing.
- Saves with a parameterized query, never by building SQL from user text.
- Unexpected errors are logged for the developer and answered with a generic `500`.

## Run it locally

You need Node 20 or newer. No Cloudflare account is required.

```bash
git clone <this repository>
cd lead-intake-worker-demo
npm install
cp .dev.vars.example .dev.vars   # a placeholder admin token for local use
npm run db:init                  # creates the local D1 table from schema.sql
npm run dev                      # serves on http://localhost:8787
```

Submit a fictional lead:

```bash
curl -X POST http://localhost:8787/api/leads \
  -H 'content-type: application/json' \
  -d '{"name":"Jordan Example","email":"jordan@example.com","service":"Gutter cleaning","message":"Please call about spring cleaning."}'
```

Expected: `{"status":"received","id":1}`

Submit something bad:

```bash
curl -X POST http://localhost:8787/api/leads \
  -H 'content-type: application/json' \
  -d '{"name":"","email":"bad","service":"x","message":"short"}'
```

Expected: a `422` listing the `name`, `email` and `message` problems.

Read the saved leads:

```bash
curl http://localhost:8787/api/leads -H 'authorization: Bearer demo-token-change-me'
```

## Self-check

```bash
npm run check
```

Runs the Worker in Node against a stand-in database and confirms the success path, each rejection (`400`, `413`, `415`, `422`), the honeypot, and the admin-token check. It prints `all checks passed`.

## Files

```
src/index.js      routes, body limits, saving, admin check
src/validate.js   the validation and cleanup rules (pure function)
schema.sql        the one table
scripts/check.mjs the self-check
wrangler.jsonc    Worker and D1 binding (placeholder database id)
```

## Privacy boundaries

- Fictional data only. Use made-up names, emails and messages when you try it.
- No real credentials, API keys, domains or database ids. The admin token is a placeholder in `.dev.vars.example`, and `.dev.vars` is git-ignored.
- No outbound requests. Nothing is emailed, texted or posted anywhere.

## What is intentionally omitted

- **Sending anything.** Notifying the owner or replying to the lead is left out. In a real build it would come after the save, and a reply to a customer would wait for human approval.
- Rate limiting and bot protection beyond the honeypot (Cloudflare's own tools would handle this in production).
- A deployed instance, a real database id, a custom domain, and any form front end.
- Deduplication, spam scoring, CRM sync and attribution tracking.
- User accounts. The private endpoint uses one shared token, which is enough for a demo only.

## License note

This repository has no open-source license and is published as a portfolio demonstration. Anyone can see it, but no permission to reuse it is granted by the absence of a license.

---

Built by Tami Stewart, [Tami Stewart Consults](https://tamistewartconsults.com).
