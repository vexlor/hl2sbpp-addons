const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const OLD = (process.env.WORKSHOP_API_URL || 'https://hl2sbpp-worckshop.onrender.com').replace(/\/$/, '');
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 200);
const SESSION_DAYS = 30;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'package') return cb(null, ext === '.zip');
    cb(null, ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext));
  }
});

const schema = `
CREATE TABLE IF NOT EXISTS sessions (id CHAR(64) PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS addons (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title VARCHAR(100) NOT NULL, description TEXT NOT NULL DEFAULT '', category VARCHAR(30) NOT NULL DEFAULT 'Other', version VARCHAR(30) NOT NULL DEFAULT '1.0.0', filename TEXT NOT NULL, original_filename TEXT NOT NULL, file_size BIGINT NOT NULL DEFAULT 0, downloads BIGINT NOT NULL DEFAULT 0, likes BIGINT NOT NULL DEFAULT 0, cover_image TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE addons ADD COLUMN IF NOT EXISTS cover_image TEXT;
CREATE TABLE IF NOT EXISTS addon_images (id BIGSERIAL PRIMARY KEY, addon_id BIGINT NOT NULL REFERENCES addons(id) ON DELETE CASCADE, image_url TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS addon_likes (addon_id BIGINT NOT NULL REFERENCES addons(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(addon_id,user_id));
CREATE TABLE IF NOT EXISTS subscriptions (addon_id BIGINT NOT NULL REFERENCES addons(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(addon_id,user_id));
CREATE TABLE IF NOT EXISTS comments (id BIGSERIAL PRIMARY KEY, addon_id BIGINT NOT NULL REFERENCES addons(id) ON DELETE CASCADE, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body VARCHAR(1000) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
`;

function clean(v, n) { return String(v ?? '').trim().slice(0, n); }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function sid(req) { return req.headers.cookie?.match(/(?:^|;\s*)hl2sbpp_session=([^;]+)/)?.[1] || null; }
function setCookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', `hl2sbpp_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
function localUrl(v) { return v ? `/uploads/${encodeURIComponent(path.basename(v))}` : null; }
function publicMedia(v) {
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const rel = String(v).startsWith('/') ? String(v) : `/${v}`;
  if (rel.startsWith('/uploads/')) {
    const localName = path.basename(rel);
    if (fs.existsSync(path.join(UPLOAD_DIR, localName))) return rel;
  }
  return OLD + rel;
}
function removeFile(filename) { if (!filename) return; try { const f = path.join(UPLOAD_DIR, path.basename(filename)); if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} }

async function createSession(userId) {
  const id = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 86400000);
  await pool.query('INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,$3)', [id, userId, exp]);
  return id;
}
async function currentUser(req) {
  const s = sid(req); if (!s) return null;
  const r = await pool.query(`SELECT u.id,u.username,u.email,u.role,u.avatar_url,u.bio,u.theme_color,u.theme_mode,u.banned FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.expires_at>NOW()`, [s]);
  return r.rowCount && !r.rows[0].banned ? r.rows[0] : null;
}
async function auth(req, res, next) {
  try { const u = await currentUser(req); if (!u) return res.status(401).json({ error: 'Authentication required' }); req.user = u; next(); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Authentication check failed' }); }
}
function addonPayload(row) {
  return { ...row, cover_image: publicMedia(row.cover_image), author_avatar: publicMedia(row.author_avatar) };
}

app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); } });
app.get('/api/me', async (req, res) => { try { res.json({ user: await currentUser(req) }); } catch { res.json({ user: null }); } });

app.post('/api/register', limiter, async (req, res) => {
  try {
    const username = clean(req.body.username, 32), email = clean(req.body.email, 255).toLowerCase();
    const password = String(req.body.password || ''), repeat = String(req.body.repeatPassword || '');
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username: 3-32 characters' });
    if (!validEmail(email)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 8 || password !== repeat) return res.status(400).json({ error: password.length < 8 ? 'Password must be at least 8 characters' : 'Passwords do not match' });
    const exists = await pool.query('SELECT 1 FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($2)', [email, username]);
    if (exists.rowCount) return res.status(409).json({ error: 'Email or username already exists' });
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query('INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email,role,avatar_url,bio,theme_color,theme_mode,banned', [username,email,hash]);
    setCookie(res, await createSession(r.rows[0].id), SESSION_DAYS * 86400); res.json({ user: r.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Registration failed' }); }
});
app.post('/api/login', limiter, async (req, res) => {
  try {
    const email = clean(req.body.email, 255).toLowerCase(), password = String(req.body.password || '');
    const r = await pool.query('SELECT id,username,email,password_hash,role,avatar_url,bio,theme_color,theme_mode,banned FROM users WHERE lower(email)=lower($1)', [email]);
    if (!r.rowCount || !(await bcrypt.compare(password, r.rows[0].password_hash))) return res.status(401).json({ error: 'Wrong email or password' });
    if (r.rows[0].banned) return res.status(403).json({ error: 'Account is banned' });
    const u = r.rows[0]; delete u.password_hash; setCookie(res, await createSession(u.id), SESSION_DAYS * 86400); res.json({ user: u });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed' }); }
});
app.post('/api/logout', async (req, res) => { const s = sid(req); if (s) await pool.query('DELETE FROM sessions WHERE id=$1', [s]); setCookie(res, '', 0); res.json({ ok: true }); });

async function oldJson(pathname, req, res) {
  const r = await fetch(OLD + pathname, { headers: { accept: 'application/json' } });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch {}
  if (!r.ok) return res.status(r.status).json(data.error ? data : { error: 'Workshop API error' });
  res.json(data);
}
function rewriteOldMedia(value) {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return OLD + (value.startsWith('/') ? value : `/${value}`);
}
function rewriteAddonMedia(data) {
  if (data?.addon) {
    data.addon.cover_image = rewriteOldMedia(data.addon.cover_image);
    data.addon.author_avatar = rewriteOldMedia(data.addon.author_avatar);
  }
  if (Array.isArray(data?.images)) data.images = data.images.map(x => ({ ...x, image_url: rewriteOldMedia(x.image_url) }));
  if (Array.isArray(data?.comments)) data.comments = data.comments.map(x => ({ ...x, avatar_url: rewriteOldMedia(x.avatar_url) }));
  if (Array.isArray(data?.addons)) data.addons = data.addons.map(x => ({ ...x, cover_image: rewriteOldMedia(x.cover_image), author_avatar: rewriteOldMedia(x.author_avatar) }));
  return data;
}
app.get('/api/addons', async (req, res) => {
  try {
    const q = clean(req.query.q, 100);
    const category = clean(req.query.category, 30);
    const sort = clean(req.query.sort, 20);
    const params = [];
    const where = [];
    if (q) { params.push(`%${q}%`); where.push(`(a.title ILIKE $${params.length} OR a.description ILIKE $${params.length} OR u.username ILIKE $${params.length})`); }
    if (category && category !== 'All') { params.push(category); where.push(`a.category=$${params.length}`); }
    let order = 'a.created_at DESC';
    if (sort === 'popular') order = 'a.likes DESC, a.downloads DESC, a.created_at DESC';
    if (sort === 'downloads') order = 'a.downloads DESC, a.created_at DESC';
    if (sort === 'rating') order = 'a.likes DESC, a.created_at DESC';
    const r = await pool.query(`SELECT a.id,a.title,a.description,a.category,a.version,a.downloads,a.likes,a.created_at,a.file_size,a.cover_image,
      u.username AS author,u.avatar_url AS author_avatar,u.role AS author_role
      FROM addons a JOIN users u ON u.id=a.user_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${order} LIMIT 100`, params);
    res.json({ addons: r.rows.map(addonPayload) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to load addons' }); }
});

app.get('/api/addons/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid addon id' });
    const r = await pool.query(`SELECT a.id,a.title,a.description,a.category,a.version,a.downloads,a.likes,a.created_at,a.file_size,a.original_filename,a.cover_image,
      u.id AS author_id,u.username AS author,u.avatar_url AS author_avatar,u.role AS author_role
      FROM addons a JOIN users u ON u.id=a.user_id WHERE a.id=$1`, [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Addon not found' });
    const images = await pool.query('SELECT id,image_url FROM addon_images WHERE addon_id=$1 ORDER BY id', [req.params.id]);
    const comments = await pool.query(`SELECT c.id,c.body,c.created_at,u.id AS user_id,u.username,u.avatar_url,u.role
      FROM comments c JOIN users u ON u.id=c.user_id WHERE c.addon_id=$1 ORDER BY c.created_at DESC`, [req.params.id]);
    res.json({
      addon: addonPayload(r.rows[0]),
      images: images.rows.map(x => ({ ...x, image_url: publicMedia(x.image_url) })),
      comments: comments.rows.map(x => ({ ...x, avatar_url: publicMedia(x.avatar_url) }))
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to load addon' }); }
});

app.get('/api/addons/:id/download', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid addon id' });
    const r = await pool.query('SELECT filename,original_filename FROM addons WHERE id=$1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Addon not found' });
    const local = path.join(UPLOAD_DIR, path.basename(r.rows[0].filename || ''));
    if (r.rows[0].filename && fs.existsSync(local)) {
      await pool.query('UPDATE addons SET downloads=downloads+1 WHERE id=$1', [req.params.id]);
      return res.download(local, r.rows[0].original_filename || path.basename(local));
    }
    return res.redirect(`${OLD}/api/addons/${encodeURIComponent(req.params.id)}/download`);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Download failed' }); }
});

app.post('/api/addons/:id/like', auth, async (req, res) => {
  const c = await pool.connect(); try { await c.query('BEGIN'); const old = await c.query('SELECT 1 FROM addon_likes WHERE addon_id=$1 AND user_id=$2',[req.params.id,req.user.id]); if(old.rowCount){await c.query('DELETE FROM addon_likes WHERE addon_id=$1 AND user_id=$2',[req.params.id,req.user.id]);await c.query('UPDATE addons SET likes=GREATEST(likes-1,0) WHERE id=$1',[req.params.id]);}else{await c.query('INSERT INTO addon_likes(addon_id,user_id) VALUES($1,$2)',[req.params.id,req.user.id]);await c.query('UPDATE addons SET likes=likes+1 WHERE id=$1',[req.params.id]);} await c.query('COMMIT'); const r=await pool.query('SELECT likes FROM addons WHERE id=$1',[req.params.id]);res.json({likes:r.rows[0]?.likes??0}); } catch(e){await c.query('ROLLBACK').catch(()=>{});res.status(500).json({error:'Like failed'});} finally{c.release();}
});
app.post('/api/addons/:id/subscribe', auth, async (req,res)=>{ try{const old=await pool.query('SELECT 1 FROM subscriptions WHERE addon_id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(old.rowCount){await pool.query('DELETE FROM subscriptions WHERE addon_id=$1 AND user_id=$2',[req.params.id,req.user.id]);return res.json({subscribed:false});}await pool.query('INSERT INTO subscriptions(addon_id,user_id) VALUES($1,$2)',[req.params.id,req.user.id]);res.json({subscribed:true});}catch(e){res.status(500).json({error:'Subscribe failed'});} });
app.post('/api/addons/:id/comments', auth, async (req,res)=>{try{const body=clean(req.body.body,1000);if(!body)return res.status(400).json({error:'Comment is empty'});await pool.query('INSERT INTO comments(addon_id,user_id,body) VALUES($1,$2,$3)',[req.params.id,req.user.id,body]);res.json({ok:true});}catch(e){res.status(500).json({error:'Comment failed'});}});

app.post('/api/addons', auth, upload.fields([{name:'package',maxCount:1},{name:'cover',maxCount:1},{name:'gallery',maxCount:6}]), async (req,res)=>{
  try{
    const pkg=req.files?.package?.[0]; if(!pkg)return res.status(400).json({error:'ZIP package required'});
    const title=clean(req.body.title,100), description=clean(req.body.description,5000), category=clean(req.body.category,30)||'Other', version=clean(req.body.version,30)||'1.0.0';
    if(title.length<2){removeFile(pkg.filename);(req.files.cover||[]).forEach(f=>removeFile(f.filename));(req.files.gallery||[]).forEach(f=>removeFile(f.filename));return res.status(400).json({error:'Title is required'});}
    const cover=req.files?.cover?.[0]?localUrl(req.files.cover[0].filename):null;
    const r=await pool.query('INSERT INTO addons(user_id,title,description,category,version,filename,original_filename,file_size,cover_image) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,title,description,category,version,downloads,likes,file_size,cover_image',[req.user.id,title,description,category,version,pkg.filename,pkg.originalname,pkg.size,cover]);
    const id=r.rows[0].id; for(const f of (req.files.gallery||[])) await pool.query('INSERT INTO addon_images(addon_id,image_url) VALUES($1,$2)',[id,localUrl(f.filename)]);
    res.status(201).json({addon:addonPayload(r.rows[0])});
  }catch(e){console.error(e);for(const k of ['package','cover','gallery'])(req.files?.[k]||[]).forEach(f=>removeFile(f.filename));res.status(500).json({error:'Upload failed'});}
});

app.get('/addon/:id', (req,res)=> /^\d+$/.test(req.params.id) ? res.sendFile(path.join(__dirname,'public','addon.html')) : res.redirect('/'));
app.get('*', (_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

pool.query(schema).then(()=>app.listen(PORT,()=>console.log(`HL2SBPP Addons listening on ${PORT}`))).catch(e=>{console.error(e);process.exit(1);});
