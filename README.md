# HL2SBPP Addons

Standalone Addons site. Uses the same Supabase PostgreSQL database as HL2SBPP Workshop.

Render environment variables:
- DATABASE_URL — same Supabase database as Workshop
- SESSION_SECRET — session secret
- WORKSHOP_PUBLIC_URL=https://hl2sbpp-worckshop-v1.onrender.com

The addon detail endpoint is `/api/addons/:id`.


## Fix
Addon detail pages are public. Login is not required to view an addon; authentication is reserved for user actions.
