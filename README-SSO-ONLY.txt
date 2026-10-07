HL2SBPP Addons — SSO ONLY

Addons no longer has its own registration or local login endpoints.
All accounts are created and authenticated in HL2SBPP Workshop.

Flow:
1. User registers/logs in on Workshop.
2. Addons sends unauthenticated users to Workshop via /auth/start.
3. Workshop creates a one-time auth transfer.
4. Addons consumes the transfer and creates a session for the SAME shared users.id.
5. Likes, subscriptions, comments and publishing use that shared user id.

Required environment:
DATABASE_URL = the same Supabase PostgreSQL URL as Workshop
WORKSHOP_PUBLIC_URL = https://hl2sbpp-worckshop-v1.onrender.com
PUBLIC_URL = https://hl2sbpp-addonss.onrender.com

Do not add a separate Addons registration/login form.
