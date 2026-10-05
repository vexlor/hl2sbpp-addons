const grid = document.querySelector("#grid");
const empty = document.querySelector("#empty");
const search = document.querySelector("#search");
let addons = [];
let filter = "all";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

function idOf(a) {
  return a.id ?? a.addon_id ?? a.addonId;
}

function titleOf(a) {
  return a.title ?? a.name ?? a.addon_name ?? `Аддон #${idOf(a)}`;
}

function imageOf(a) {
  return a.cover_url ?? a.cover ?? a.image_url ?? a.image ?? "/placeholder.svg";
}

function starsOf(a) {
  return Number(a.rating ?? a.stars ?? 0) || 0;
}

function render() {
  const q = search.value.trim().toLowerCase();
  let list = addons.filter(a => titleOf(a).toLowerCase().includes(q));

  if (filter === "popular") {
    list = [...list].sort((a,b) => (b.downloads ?? b.download_count ?? 0) - (a.downloads ?? a.download_count ?? 0));
  }
  if (filter === "new") {
    list = [...list].sort((a,b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
  }

  empty.hidden = list.length !== 0;
  grid.innerHTML = list.map(a => {
    const id = idOf(a);
    const stars = Math.max(0, Math.min(5, Math.round(starsOf(a))));
    return `<a class="card" href="/addon/${encodeURIComponent(id)}">
      <div class="cover"><img src="${esc(imageOf(a))}" onerror="this.src='/placeholder.svg'"></div>
      <div class="cardBody">
        <h3>${esc(titleOf(a))}</h3>
        <div class="stars">${"★".repeat(stars)}${"☆".repeat(5-stars)}</div>
        <small>Аддон #${esc(id)}</small>
      </div>
    </a>`;
  }).join("");
}

async function init() {
  try {
    const cfg = await fetch("/api/config").then(r => r.json());
    if (cfg.addonsSiteUrl) {
      document.querySelector("#workshopLink").href = cfg.addonsSiteUrl;
    }
    const r = await fetch("/api/addons");
    const data = await r.json();
    addons = Array.isArray(data) ? data : (data.addons || data.items || []);
    render();
  } catch {
    grid.innerHTML = `<div class="error">Не удалось загрузить аддоны.</div>`;
  }
}

search.addEventListener("input", render);
document.querySelectorAll(".filter").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  filter = b.dataset.filter;
  render();
}));
init();
