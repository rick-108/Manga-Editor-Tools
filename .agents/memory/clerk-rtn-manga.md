---
name: Clerk Setup - RTN Manga
description: How Clerk is integrated in the RTN Manga project; key pitfalls and decisions.
---

## Setup
- Replit-managed Clerk (setupClerkWhitelabelAuth() provisioned it).
- Status was `not_configured` → now active.
- Keys auto-set: CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY.

## Critical: Use `Show` not `SignedIn`/`SignedOut`
`@clerk/react` in this project does NOT export `SignedIn` or `SignedOut` components.
Use `<Show when="signed-in">` and `<Show when="signed-out">` from `@clerk/react` instead.

**Why:** Runtime error "does not provide an export named 'SignedIn'" confirmed on deploy.

## Auth Transport
- Web app: cookie-based. No Bearer tokens in browser fetch calls. Clerk session cookie sent automatically.
- Publisher panel: still uses its own JWT (separate code-based auth) stored in localStorage as `rtn_publisher_token`.

## Routes
- /sign-in/*? and /sign-up/*? (wouter optional wildcard required)
- `requireUser` middleware uses `getAuth(req)` from `@clerk/express` — returns Clerk string userId.

## Appearance
- Dark theme matching site: bg hsl(240,10%,4%), primary hsl(346,87%,43%) red.
- shadcn theme from @clerk/themes; cssLayerName: "clerk"; optimize: false in vite.config.ts.
