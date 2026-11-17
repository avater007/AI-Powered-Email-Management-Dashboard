# Relay – AI email desk for personal assistants (MERN prototype)

React (Vite) + Express + MongoDB. An LLM classifies threads and drafts replies when `LLM_URL` is configured (see `.env.example`); otherwise a built-in rules engine runs so the app works offline.

## Run
```bash
# 1. MongoDB running locally (or use an Atlas URI)
cd server && cp .env.example .env && npm i && npm run dev     # API on :4000
cd client && npm i && npm run dev                              # UI on :5173
```
Production: `cd client && npm run build`, then `cd server && npm start` serves the UI and API together (one deploy on Render/Railway).

## Flow
Log in (new emails sign up) → connect Gmail/Outlook → inbox imported and classified → toggle **Client view** in the header.

## What is simulated
- Gmail/Outlook OAuth: `POST /api/accounts` marks the provider connected and imports 12 sample emails.
  To go live: Google OAuth + Gmail API `users.threads.list/get` (and `watch` for push), Microsoft Graph `/me/messages` with delta queries; store tokens encrypted; call `classify()` on each new/updated thread.
- "Simulate new reply arriving" stands in for a webhook; it calls the same `classify()` a real webhook would.
- Sending: `/emails/:id/send` appends to the thread only. Swap for `gmail.users.messages.send` after the user approves.

## Key design rules (see server/src/ai.js)
- Manual corrections are never overwritten by AI (`manual: true`) until the assistant presses "Reset to AI".
- Confidence < 0.6 always becomes `review`.
- New messages in a thread trigger reclassification with the full thread as context.
- Every assistant and client action goes through `PATCH /api/emails/:id`, so both views stay in sync.
