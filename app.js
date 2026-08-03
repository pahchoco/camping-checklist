const editView = document.getElementById('edit-view');
const resultView = document.getElementById('result-view');
const categoriesEl = document.getElementById('categories');
const resultContent = document.getElementById('result-content');

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// The category/mid/sub tree is fixed by CATEGORY_CONFIG (categories.js), not
// user-editable. Only each subcategory's item list is user data, saved keyed
// by its "대분류›중분류›소분류" id so edits to CATEGORY_CONFIG (reordering,
// adding entries) don't disturb previously saved items — renaming an entry
// does, since the id is name-based.
function buildStateFromConfig(savedItemsBySubId) {
  return CATEGORY_CONFIG.map(cat => ({
    id: cat.name, name: cat.name, collapsed: false,
    midcategories: cat.mids.map(mid => ({
      id: `${cat.name}›${mid.name}`, name: mid.name, collapsed: false,
      subcategories: mid.subs.map(subName => {
        const subId = `${cat.name}›${mid.name}›${subName}`;
        return { id: subId, name: subName, items: savedItemsBySubId[subId] || [] };
      }),
    })),
  }));
}

let state = buildStateFromConfig(JSON.parse(localStorage.getItem('campChecklistItems') || '{}'));

function save() {
  const bySubId = {};
  state.forEach(cat => cat.midcategories.forEach(mid => mid.subcategories.forEach(sub => {
    bySubId[sub.id] = sub.items;
  })));
  localStorage.setItem('campChecklistItems', JSON.stringify(bySubId));
}

function render() {
  categoriesEl.innerHTML = '';
  state.forEach(cat => categoriesEl.appendChild(renderCategory(cat)));
}

function renderCategory(cat) {
  const div = document.createElement('div');
  div.className = 'category';
  div.innerHTML = `
    <div class="category-header" data-toggle="${cat.id}">
      <h2>${cat.name}</h2>
    </div>
    <div class="category-body ${cat.collapsed ? 'collapsed' : ''}"></div>
  `;
  const body = div.querySelector('.category-body');
  cat.midcategories.forEach(mid => body.appendChild(renderMidcategory(cat, mid)));
  return div;
}

function renderMidcategory(cat, mid) {
  const div = document.createElement('div');
  div.className = 'midcategory';
  div.innerHTML = `
    <div class="midcategory-header" data-toggle-mid="${mid.id}" data-cat="${cat.id}">
      <h3>${mid.name}</h3>
    </div>
    <div class="subcategories ${mid.collapsed ? 'collapsed' : ''}"></div>
  `;
  const subs = div.querySelector('.subcategories');
  mid.subcategories.forEach(sub => subs.appendChild(renderSubcategory(cat, mid, sub)));
  return div;
}

function renderSubcategory(cat, mid, sub) {
  const div = document.createElement('div');
  div.className = 'subcategory';
  div.innerHTML = `
    <div class="subcategory-header">
      <h4>${sub.name}</h4>
    </div>
    <input type="text" class="item-search-input" placeholder="🔍 제품 검색" data-action="search-item">
    <div class="items"></div>
    <div class="add-item-row">
      <input type="text" placeholder="항목 입력" data-cat="${cat.id}" data-mid="${mid.id}" data-sub="${sub.id}" class="new-item-input">
      <button data-action="add-item" data-cat="${cat.id}" data-mid="${mid.id}" data-sub="${sub.id}">추가</button>
    </div>
  `;
  const items = div.querySelector('.items');
  sub.items.forEach(item => items.appendChild(renderItem(cat, mid, sub, item)));
  return div;
}

function renderItem(cat, mid, sub, item) {
  const div = document.createElement('div');
  div.className = 'item-row';
  const attrs = `data-cat="${cat.id}" data-mid="${mid.id}" data-sub="${sub.id}" data-item="${item.id}"`;
  const thumb = item.photo
    ? `<img class="item-thumb" src="${item.photo}" data-action="pick-photo" ${attrs}>`
    : `<span class="item-thumb empty" data-action="pick-photo" ${attrs}>📷</span>`;
  div.innerHTML = `
    ${thumb}
    <label>
      <input type="checkbox" data-action="toggle-item" ${attrs} ${item.checked ? 'checked' : ''}>
      ${item.text}
    </label>
    <button class="remove-item" data-action="del-item" ${attrs}>×</button>
  `;
  return div;
}

// ponytail: photos are downscaled + JPEG-compressed before storing as a
// data URL in localStorage (5-10MB quota). Fine for a personal item list;
// move to IndexedDB/object storage if items grow into the hundreds.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 480 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

const photoInput = document.createElement('input');
photoInput.type = 'file';
photoInput.accept = 'image/*';
photoInput.style.display = 'none';
document.body.appendChild(photoInput);
let pickTarget = null;

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file || !pickTarget) return;
  const { catId, midId, subId, itemId } = pickTarget;
  const dataUrl = await compressImage(file);
  const sub = findSub(catId, midId, subId);
  sub.items.find(i => i.id === itemId).photo = dataUrl;
  save(); render();
});

function findCat(catId) { return state.find(c => c.id === catId); }
function findMid(catId, midId) { return findCat(catId).midcategories.find(m => m.id === midId); }
function findSub(catId, midId, subId) { return findMid(catId, midId).subcategories.find(s => s.id === subId); }

categoriesEl.addEventListener('click', e => {
  const toggleHeader = e.target.closest('[data-toggle]');
  if (toggleHeader && !e.target.closest('button')) {
    const cat = findCat(toggleHeader.dataset.toggle);
    cat.collapsed = !cat.collapsed;
    save(); render();
    return;
  }

  const toggleMidHeader = e.target.closest('[data-toggle-mid]');
  if (toggleMidHeader && !e.target.closest('button')) {
    const mid = findMid(toggleMidHeader.dataset.cat, toggleMidHeader.dataset.toggleMid);
    mid.collapsed = !mid.collapsed;
    save(); render();
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, cat: catId, mid: midId, sub: subId, item: itemId } = btn.dataset;

  if (action === 'add-item') {
    const input = categoriesEl.querySelector(`.new-item-input[data-cat="${catId}"][data-mid="${midId}"][data-sub="${subId}"]`);
    addItem(catId, midId, subId, input);
  } else if (action === 'del-item') {
    const sub = findSub(catId, midId, subId);
    sub.items = sub.items.filter(i => i.id !== itemId);
    save(); render();
  } else if (action === 'pick-photo') {
    pickTarget = { catId, midId, subId, itemId };
    photoInput.click();
  }
});

categoriesEl.addEventListener('change', e => {
  if (e.target.dataset.action !== 'toggle-item') return;
  const { cat: catId, mid: midId, sub: subId, item: itemId } = e.target.dataset;
  findSub(catId, midId, subId).items.find(i => i.id === itemId).checked = e.target.checked;
  save();
});

categoriesEl.addEventListener('input', e => {
  if (e.target.dataset.action !== 'search-item') return;
  const query = e.target.value.trim().toLowerCase();
  const rows = e.target.closest('.subcategory').querySelectorAll('.item-row');
  rows.forEach(row => {
    const text = row.querySelector('label').textContent.trim().toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
});

categoriesEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('new-item-input')) return;
  const { cat: catId, mid: midId, sub: subId } = e.target.dataset;
  addItem(catId, midId, subId, e.target);
});

function addItem(catId, midId, subId, input) {
  const text = input.value.trim();
  if (!text) return;
  findSub(catId, midId, subId).items.push({ id: uid(), text, checked: false, photo: null });
  save(); render();
}

function getCheckedGroups() {
  return state
    .map(cat => ({
      cat,
      mids: cat.midcategories
        .map(mid => ({
          mid,
          subs: mid.subcategories
            .map(sub => ({ sub, items: sub.items.filter(i => i.checked) }))
            .filter(s => s.items.length),
        }))
        .filter(m => m.subs.length),
    }))
    .filter(c => c.mids.length);
}

document.getElementById('camp-btn').addEventListener('click', () => {
  resultContent.innerHTML = '';
  const groups = getCheckedGroups();

  groups.forEach(({ cat, mids }) => {
    const catDiv = document.createElement('div');
    catDiv.className = 'result-category';
    catDiv.innerHTML = `<h2>${cat.name}</h2>`;
    mids.forEach(({ mid, subs }) => {
      const midDiv = document.createElement('div');
      midDiv.className = 'result-mid';
      midDiv.innerHTML = `<h3>${mid.name}</h3>`;
      subs.forEach(({ sub, items }) => {
        const subDiv = document.createElement('div');
        subDiv.className = 'result-sub';
        const cards = items.map(i => `
          <div class="result-card">
            ${i.photo ? `<img src="${i.photo}">` : `<div class="no-photo">🏕️</div>`}
            <div class="name">${i.text}</div>
          </div>
        `).join('');
        subDiv.innerHTML = `<h4>${sub.name}</h4><div class="result-items">${cards}</div>`;
        midDiv.appendChild(subDiv);
      });
      catDiv.appendChild(midDiv);
    });
    resultContent.appendChild(catDiv);
  });

  if (!groups.length) resultContent.innerHTML = '<p class="empty-msg">체크된 항목이 없습니다.</p>';

  editView.hidden = true;
  resultView.hidden = false;
});

document.getElementById('back-btn').addEventListener('click', () => {
  resultView.hidden = true;
  editView.hidden = false;
});

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// Draws the checked-item result (grouped by category > midcategory > subcategory)
// onto a canvas by hand rather than via html2canvas: the result view's photo-card
// grid renders unreliably through html2canvas on mobile browsers, and drawing it
// ourselves lets us control the output size/aspect ratio for social sharing.
async function buildResultCanvas() {
  const groups = getCheckedGroups();
  if (!groups.length) return null;

  const W = 800, PAD = 32, CARD = 150, GAP = 14;
  const cols = Math.max(1, Math.floor((W - PAD * 2 + GAP) / (CARD + GAP)));
  const cardBlock = CARD + 34 + GAP;

  const images = new Map();
  for (const { mids } of groups)
    for (const { subs } of mids)
      for (const { items } of subs)
        for (const item of items) if (item.photo) images.set(item.id, await loadImage(item.photo));

  let y = PAD + 50;
  for (const { mids } of groups) {
    y += 40;
    for (const { subs } of mids) {
      y += 30;
      for (const { items } of subs) y += 26 + Math.ceil(items.length / cols) * cardBlock;
    }
    y += 16;
  }
  y += PAD;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = y;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, canvas.height);

  let cy = PAD;
  ctx.fillStyle = '#222';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('내 캠핑 세팅 완성! 🏕️', PAD, cy + 30);
  cy += 50;

  groups.forEach(({ cat, mids }) => {
    ctx.fillStyle = '#222';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(cat.name, PAD, cy + 20);
    ctx.strokeStyle = '#333';
    ctx.beginPath(); ctx.moveTo(PAD, cy + 28); ctx.lineTo(W - PAD, cy + 28); ctx.stroke();
    cy += 40;

    mids.forEach(({ mid, subs }) => {
      ctx.fillStyle = '#444';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(mid.name, PAD, cy + 14);
      cy += 30;

      subs.forEach(({ sub, items }) => {
        ctx.fillStyle = '#666';
        ctx.font = '13px sans-serif';
        ctx.fillText(sub.name, PAD + 10, cy + 12);
        cy += 26;

        items.forEach((item, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          const x = PAD + col * (CARD + GAP);
          const cardY = cy + row * cardBlock;

          const img = images.get(item.id);
          ctx.fillStyle = '#f0ede8';
          roundRect(ctx, x, cardY, CARD, CARD, 10);
          ctx.fill();
          if (img) {
            ctx.save();
            roundRect(ctx, x, cardY, CARD, CARD, 10);
            ctx.clip();
            drawCover(ctx, img, x, cardY, CARD, CARD);
            ctx.restore();
          } else {
            ctx.fillStyle = '#aaa';
            ctx.font = '32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🏕️', x + CARD / 2, cardY + CARD / 2 + 10);
          }
          ctx.fillStyle = '#222';
          ctx.font = '13px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(truncateText(ctx, item.text, CARD - 8), x + CARD / 2, cardY + CARD + 20);
          ctx.textAlign = 'left';
        });

        cy += Math.ceil(items.length / cols) * cardBlock;
      });
    });
    cy += 16;
  });

  return canvas;
}

async function shareOrDownload(blob) {
  const file = new File([blob], 'camping-checklist.jpg', { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '내 캠핑 세팅' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'camping-checklist.jpg';
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('share-btn').addEventListener('click', async e => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const canvas = await buildResultCanvas();
    if (!canvas) { alert('체크된 항목이 없습니다.'); return; }
    canvas.toBlob(blob => shareOrDownload(blob).finally(() => { btn.disabled = false; }), 'image/jpeg', 0.9);
  } catch (e) {
    btn.disabled = false;
  }
});

render();
