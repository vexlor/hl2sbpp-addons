HL2SBPP ADDONS — SHARED WORKSHOP ACCOUNT

Workshop is the single registration/login source.
Addons uses the same Supabase/Postgres users table and the one-time SSO transfer.

Synced profile data:
- username
- email
- avatar/photo (proxied from Workshop uploads)
- bio
- role/admin badge
- theme fields
- registration date
- addon/like/subscription/comment counters

The password is NEVER sent through the browser or URL. Authentication is transferred
with a one-time token and the Addons session is created for the same user_id.

Required env:
WORKSHOP_PUBLIC_URL=https://hl2sbpp-worckshop-v1.onrender.com
PUBLIC_URL=https://hl2sbpp-addonss.onrender.com
DATABASE_URL=<same Supabase DATABASE_URL as Workshop>
SESSION_SECRET=<Addons session secret>
