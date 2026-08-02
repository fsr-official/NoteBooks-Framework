# Private Backend Service

This lightweight backend is intended to run behind a protected endpoint and not be publicly exposed.

## Purpose

- Serve `files.json` and runtime `config` from a controlled server.
- Keep backend-only logic and secrets off the public web root.

## Run

1. Install dependencies: `npm install`
2. Start: `npx ts-node backend/server.ts`

## Notes

- This backend is separate from public frontend assets located in the project root.
- Public pages should use `/api/*` only for customer-facing functionality.
