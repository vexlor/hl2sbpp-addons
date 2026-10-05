const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const WORKSHOP_API_URL = (process.env.WORKSHOP_API_URL || "").replace(/\/$/, "");
const ADDONS_SITE_URL = (process.env.ADDONS_SITE_URL || "").replace(/\/$/, "");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function workshop(pathname, options = {}) {
  if (!WORKSHOP_API_URL) {
    return { ok: false, status: 500, data: { error: "WORKSHOP_API_URL is not configured" } };
  }

  const response = await fetch(WORKSHOP_API_URL + pathname, {
    ...options,
    headers: {
      "Accept": "application/json",
      ...(options.headers || {})
    }
  });

  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json")
    ? await response.json()
    : await response.text();

  return { ok: response.ok, status: response.status, data };
}

app.get("/api/config", (req, res) => {
  res.json({
    addonsSiteUrl: ADDONS_SITE_URL || null,
    workshopApiConfigured: Boolean(WORKSHOP_API_URL)
  });
});

app.get("/api/addons", async (req, res) => {
  try {
    const result = await workshop("/api/addons" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
    res.status(result.status).send(result.data);
  } catch (e) {
    res.status(502).json({ error: "Workshop API unavailable" });
  }
});

app.get("/api/addons/:id", async (req, res) => {
  try {
    const result = await workshop(`/api/addons/${encodeURIComponent(req.params.id)}`);
    res.status(result.status).send(result.data);
  } catch (e) {
    res.status(502).json({ error: "Workshop API unavailable" });
  }
});

app.get("/api/addons/:id/comments", async (req, res) => {
  try {
    const result = await workshop(`/api/addons/${encodeURIComponent(req.params.id)}/comments`);
    res.status(result.status).send(result.data);
  } catch (e) {
    res.status(502).json({ error: "Workshop API unavailable" });
  }
});

// Keep download URL compatible with the existing Workshop server.
app.get("/download/:id", (req, res) => {
  if (!WORKSHOP_API_URL) return res.status(500).send("Workshop API is not configured");
  res.redirect(`${WORKSHOP_API_URL}/api/addons/${encodeURIComponent(req.params.id)}/download`);
});

// Real addon route: /addon/16, /addon/27, etc.
app.get("/addon/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "addon.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`HL2SBPP Addons listening on ${PORT}`);
});
