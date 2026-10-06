const $=s=>document.querySelector(s);
const addonId=Number(location.pathname.match(/^\/addon\/(\d+)\/?$/)?.[1]||0);
let current=null;
let currentUser=null;

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function avatar(url,name,cls='avatar'){
  if(url)return `<img class="${cls}" src="${esc(url)}" alt="">`;
  return `<span class="${cls} avatar-letter">${esc((name||'?')[0].toUpperCase())}</span>`;
}
function badge(role){return role==='admin'?'<span class="verify">✓</span>':'';}
function formatSize(n){n=Number(n||0);if(!n)return '—';const u=['Б','КБ','МБ','ГБ'];let i=0;while(n>=1024&&i<3){n/=1024;i++;}return `${n.toFixed(i?1:0)} ${u[i]}`;}
function formatDate(v){return v?new Date(v).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'}):'—';}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove('show'),2600);}
async function api(url,opt={}){
  const r=await fetch(url,{credentials:'same-origin',...opt});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||`Ошибка ${r.status}`);
  return data;
}

function starLine(likes){
  const n=Math.max(1,Math.min(5,Math.round(Number(likes||0)>1000?5:Number(likes||0)/250)));
  return '★'.repeat(n)+'☆'.repeat(5-n);
}

function renderComments(list){
  if(!list.length)return '<div class="empty-comments">Комментариев пока нет. Будь первым.</div>';
  return list.map(c=>{
    const name=c.author||c.username||'Пользователь';
    return `<div class="comment">
      ${avatar(c.author_avatar||c.avatar_url,name)}
      <div class="comment-body">
        <div class="comment-head"><strong>${esc(name)}</strong>${badge(c.author_role||c.role)}<small>${formatDate(c.created_at)}</small></div>
        <p>${esc(c.body||'')}</p>
      </div>
    </div>`;
  }).join('');
}

function renderSimilar(items,a){
  const same=(items||[]).filter(x=>String(x.id)!==String(a.id)).slice(0,4);
  if(!same.length)return '';
  return `<section class="card similar-card"><h2>Похожие аддоны</h2><div class="similar">${
    same.map(x=>`<a class="similar-item" href="/addon/${encodeURIComponent(x.id)}">
      ${x.cover_image?`<img src="${esc(x.cover_image)}" alt="">`:'<span class="similar-placeholder">◇</span>'}
      <div><b>${esc(x.title)}</b><span>${esc(x.author||'Автор')} · ♥ ${esc(x.likes||0)}</span></div>
    </a>`).join('')
  }</div></section>`;
}

function render(d,all=[]){
  current=d;
  const a=d.addon;
  const images=[a.cover_image,...(d.images||[]).map(x=>x.image_url)].filter(Boolean);
  document.title=`${a.title} — HL2SBPP Addons`;

  $('#addonPage').innerHTML=`
    <div class="left-col">
      <article class="card">
        <div class="media main-media">${images[0]?`<img id="mainImage" src="${esc(images[0])}" alt="${esc(a.title)}">`:'<div class="empty-media">◇</div>'}</div>
        ${images.length?`<div class="thumbs">${images.map((src,i)=>`<button class="thumb ${i===0?'active':''}" data-src="${esc(src)}" type="button"><img src="${esc(src)}" alt=""></button>`).join('')}</div>`:''}
        <div class="content">
          <div class="title-row">
            <div>
              <h1>${esc(a.title)}</h1>
              <div class="author">${avatar(a.author_avatar,a.author)}<span>${esc(a.author||'Неизвестный автор')} ${badge(a.author_role)}</span></div>
            </div>
            <div class="rating"><div class="stars">${starLine(a.likes)}</div><small>♥ ${esc(a.likes||0)} оценок</small></div>
          </div>
          <div class="tags"><span class="tag">${esc(a.category||'Other')}</span><span class="tag">Версия ${esc(a.version||'1.0.0')}</span></div>
        </div>
      </article>

      <section class="card description-card">
        <div class="section-head">◇ Описание</div>
        <div class="description">${esc(a.description||'Описание отсутствует.')}</div>
      </section>

      <section class="card comments">
        <div class="comments-head"><h2>Комментарии</h2><span class="count" id="commentCount">${d.comments?.length||0}</span></div>
        <form id="commentForm" class="comment-form">
          <input id="commentInput" maxlength="1000" placeholder="Написать комментарий..." autocomplete="off" required>
          <button type="submit">➤</button>
        </form>
        <div id="loginHint" class="login-hint" hidden></div>
        <div id="commentsList">${renderComments(d.comments||[])}</div>
      </section>
    </div>

    <aside class="right-col">
      <section class="card info-card">
        <div class="mini-cover">${images[0]?`<img src="${esc(images[0])}" alt="">`:'<div class="empty-media">◇</div>'}</div>
        <h2>Информация об аддоне</h2>
        <div class="info-list">
          <div class="info-row"><span>Тип</span><b>${esc(a.category||'Аддон')}</b></div>
          <div class="info-row"><span>Категория</span><b>${esc(a.category||'Other')}</b></div>
          <div class="info-row"><span>Версия</span><b>${esc(a.version||'1.0.0')}</b></div>
          <div class="info-row"><span>Размер файла</span><b>${formatSize(a.file_size)}</b></div>
          <div class="info-row"><span>Добавлен</span><b>${formatDate(a.created_at)}</b></div>
          <div class="info-row"><span>Скачиваний</span><b id="downloadCount">${esc(a.downloads||0)}</b></div>
          <div class="info-row"><span>Автор</span><b>${esc(a.author||'—')}</b></div>
        </div>
        <button id="downloadBtn" class="primary" type="button">⇩ &nbsp; Скачать</button>
        <div class="actions">
          <button id="likeBtn" class="action" type="button">♡ Лайк <span id="likeCount">${esc(a.likes||0)}</span></button>
          <button id="subBtn" class="action" type="button">☆ Подписаться</button>
        </div>
      </section>
      ${renderSimilar(all,a)}
    </aside>`;
  $('#addonPage').hidden=false;
  $('#pageStatus').textContent='';

  document.querySelectorAll('.thumb').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('.thumb').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');$('#mainImage').src=b.dataset.src;
  }));
  $('#downloadBtn').addEventListener('click',downloadAddon);
  $('#likeBtn').addEventListener('click',likeAddon);
  $('#subBtn').addEventListener('click',subscribeAddon);
  $('#commentForm').addEventListener('submit',submitComment);
}

async function loadUser(){
  try{
    const d=await api('/api/me'); const u=d.user;
    currentUser=u||null;
    const form=$('#commentForm'),hint=$('#loginHint');
    if(!u){
      form.hidden=true;
      hint.hidden=false;
      hint.innerHTML=`Чтобы писать комментарии, войдите через <b>HL2SBPP Workshop</b>. <a href="/auth/start?next=${encodeURIComponent(location.pathname)}">Войти через Workshop</a>`;
      return;
    }
    form.hidden=false; hint.hidden=true;
    $('#miniName').textContent=u.username;
    $('#sideName').textContent=u.username;
    $('#sideRole').textContent=u.role==='admin'?'Администратор':'Пользователь';
    const av=u.avatar_url;
    if(av){
      $('#miniAvatar').innerHTML=`<img src="${esc(av)}" alt="">`;
      $('#sideAvatar').outerHTML=avatar(av,u.username,'avatar-letter');
    }
  }catch{}
}

async function load(){
  if(!addonId){$('#pageStatus').textContent='Некорректный адрес аддона.';return;}
  try{
    const d=await api(`/api/addons/${addonId}`);
    let all=[];
    try{const list=await api(`/api/addons?category=${encodeURIComponent(d.addon.category||'')}`);all=list.addons||[]}catch{}
    render(d,all);
    loadUser();
  }catch(e){
    $('#addonPage').hidden=false;
    $('#addonPage').innerHTML=`<div class="card error-box"><h1>Не удалось открыть аддон</h1><p>${esc(e.message)}</p></div>`;
    $('#pageStatus').textContent='';
  }
}

async function downloadAddon(){
  const btn=$('#downloadBtn');btn.disabled=true;const old=btn.textContent;btn.textContent='Подготовка файла...';
  try{
    const r=await fetch(`/api/addons/${addonId}/download`,{credentials:'same-origin'});
    const type=r.headers.get('content-type')||'';
    if(!r.ok){
      const d=await r.json().catch(()=>({}));
      throw new Error(d.error||'Не удалось скачать файл');
    }
    if(type.includes('application/json')){
      const d=await r.json();throw new Error(d.error||'Файл недоступен');
    }
    const blob=await r.blob();
    const cd=r.headers.get('Content-Disposition')||'';
    let name='addon.zip';
    const m=cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    if(m)name=decodeURIComponent(m[1]||m[2]);
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    $('#downloadCount').textContent=String(Number($('#downloadCount').textContent||0)+1);
    toast('Скачивание началось');
  }catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent=old}
}
async function likeAddon(){
  try{const d=await api(`/api/addons/${addonId}/like`,{method:'POST'});$('#likeCount').textContent=d.likes;toast('Лайк обновлён')}
  catch(e){if(e.message.includes('Authentication'))location.href='/auth/start?next='+encodeURIComponent(location.pathname);else toast(e.message)}
}
async function subscribeAddon(){
  try{const d=await api(`/api/addons/${addonId}/subscribe`,{method:'POST'});$('#subBtn').textContent=d.subscribed?'✓ Подписка':'☆ Подписаться';toast(d.subscribed?'Вы подписались':'Подписка отменена')}
  catch(e){if(e.message.includes('Authentication'))location.href='/auth/start?next='+encodeURIComponent(location.pathname);else toast(e.message)}
}
async function submitComment(e){
  e.preventDefault();const input=$('#commentInput'),btn=e.submitter;const body=input.value.trim();if(!body)return;
  btn.disabled=true;
  try{
    const d=await api(`/api/addons/${addonId}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body})});
    const c=d.comment;const list=$('#commentsList');
    if(list.querySelector('.empty-comments'))list.innerHTML='';
    list.insertAdjacentHTML('afterbegin',`<div class="comment">${avatar(c.avatar_url,c.username)}<div class="comment-body"><div class="comment-head"><strong>${esc(c.username)}</strong>${badge(c.role)}<small>${formatDate(c.created_at)}</small></div><p>${esc(c.body)}</p></div></div>`);
    $('#commentCount').textContent=String(Number($('#commentCount').textContent||0)+1);input.value='';toast('Комментарий добавлен');
  }catch(e){
    if(e.message.includes('Authentication')){location.href='/auth/start?next='+encodeURIComponent(location.pathname);return;}
    toast(e.message);
  }finally{btn.disabled=false}
}

$('#backBtn').addEventListener('click',()=>history.length>1?history.back():location.href='/');
$('#topSearch').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.value.trim())location.href='/?q='+encodeURIComponent(e.target.value.trim())});
load();
