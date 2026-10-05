const page = document.querySelector("#addonPage");
const id = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function titleOf(a) { return a.title ?? a.name ?? a.addon_name ?? `Аддон #${id}`; }
function imageOf(a) { return a.cover_url ?? a.cover ?? a.image_url ?? a.image ?? "/placeholder.svg"; }
function starsOf(a) { return Math.max(0, Math.min(5, Math.round(Number(a.rating ?? a.stars ?? 0) || 0))); }

async function init() {
  try {
    const r = await fetch(`/api/addons/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error();
    const raw = await r.json();
    const a = raw.addon ?? raw.item ?? raw;

    const stars = starsOf(a);
    const description = a.description ?? a.desc ?? "Описание отсутствует.";
    const author = a.author_name ?? a.username ?? a.author?.username ?? "Автор";

    page.innerHTML = `
      <a class="back" href="/">← Все аддоны</a>
      <div class="addonLayout">
        <section>
          <div class="mainCover"><img src="${esc(imageOf(a))}" onerror="this.src='/placeholder.svg'"></div>
        </section>
        <aside class="info">
          <div class="tag">ADDON #${esc(id)}</div>
          <h1>${esc(titleOf(a))}</h1>
          <div class="stars big">${"★".repeat(stars)}${"☆".repeat(5-stars)}</div>
          <p class="author">Автор: <b>${esc(author)}</b></p>
          <p class="description">${esc(description)}</p>
          <a class="download" href="/download/${encodeURIComponent(id)}">Скачать аддон</a>
        </aside>
      </div>
      <section class="comments">
        <h2>Комментарии</h2>
        <div id="comments">Загрузка...</div>
      </section>`;
    loadComments();
  } catch {
    page.innerHTML = `<div class="error">Аддон #${esc(id)} не найден.</div>`;
  }
}

async function loadComments() {
  const box = document.querySelector("#comments");
  try {
    const r = await fetch(`/api/addons/${encodeURIComponent(id)}/comments`);
    const raw = await r.json();
    const comments = Array.isArray(raw) ? raw : (raw.comments || []);
    box.innerHTML = comments.length
      ? comments.map(c => `<div class="comment"><b>${esc(c.username ?? c.author_name ?? "Пользователь")}</b><p>${esc(c.text ?? c.content ?? "")}</p></div>`).join("")
      : `<div class="muted">Комментариев пока нет.</div>`;
  } catch {
    box.innerHTML = `<div class="muted">Комментарии пока недоступны.</div>`;
  }
}
init();
