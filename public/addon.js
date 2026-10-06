const id = location.pathname.split('/').filter(Boolean).pop();

async function loadAddon() {
  const root = document.getElementById('app') || document.body;
  try {
    const r = await fetch('/api/addons/' + encodeURIComponent(id));
    const data = await r.json();
    if (!r.ok || !data.addon) throw new Error(data.error || 'Аддон не найден');

    const a = data.addon;
    document.title = a.title || 'Addon';

    root.innerHTML = `
      <main class="addon-page">
        <a href="/" class="back">← Назад</a>
        <h1>${esc(a.title || 'Без названия')}</h1>
        <p>${esc(a.description || '')}</p>
        <div class="meta">
          <span>Категория: ${esc(a.category || '—')}</span>
          <span>Версия: ${esc(a.version || '—')}</span>
        </div>
        <div id="images"></div>
        <div class="actions">
          <a class="button" href="/api/addons/${encodeURIComponent(id)}/download">Скачать</a>
        </div>
        <section>
          <h2>Комментарии</h2>
          <div id="comments"></div>
        </section>
      </main>`;

    const images = Array.isArray(data.images) ? data.images : [];
    const imgRoot = document.getElementById('images');
    if (imgRoot && images.length) {
      imgRoot.innerHTML = images.map(x => `<img src="${escAttr(x.url || '')}" alt="">`).join('');
    }

    const comments = Array.isArray(data.comments) ? data.comments : [];
    const cRoot = document.getElementById('comments');
    if (cRoot) {
      cRoot.innerHTML = comments.length
        ? comments.map(c => `<div class="comment"><b>${esc(c.username || c.login || 'Пользователь')}</b><p>${esc(c.text || '')}</p></div>`).join('')
        : '<p>Комментариев пока нет.</p>';
    }
  } catch (e) {
    root.innerHTML = `<main class="addon-page"><a href="/">← На главную</a><h1>Аддон не найден</h1><p>${esc(e.message || 'Ошибка загрузки')}</p></main>`;
  }
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function escAttr(v) { return esc(v); }

loadAddon();
