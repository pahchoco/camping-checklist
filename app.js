firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const editView = document.getElementById('edit-view');
const resultView = document.getElementById('result-view');
const settingsView = document.getElementById('settings-view');
const categoriesEl = document.getElementById('categories');
const resultContent = document.getElementById('result-content');
const settingsList = document.getElementById('settings-list');

// Maps CATEGORY_CONFIG's 대분류 names (categories.js) to a placeholder icon,
// shown on result cards for items with no uploaded photo.
const CATEGORY_ICONS = {
  '텐트/쉘터': '⛺', '침구/수면': '🛏️', '취사': '🍳', '가구/조명': '🪑',
  '화로/난방': '🔥', '수납/운반': '🎒', '차량/오토캠핑': '🚙', '소품/데코': '✨',
};
const SETTING_TAG_COLORS = ['var(--green)', 'var(--khaki)', 'var(--accent)'];

// Which items *this* visitor has checked — personal, stays in localStorage.
// The items themselves (name + photo) are shared via Firestore, see below.
const checkedIds = new Set(JSON.parse(localStorage.getItem('campChecklistChecked') || '[]'));
function saveChecked() {
  localStorage.setItem('campChecklistChecked', JSON.stringify([...checkedIds]));
}

// Named snapshots of checkedIds — personal, stays in localStorage alongside
// the working checked state above.
const SETTINGS_KEY = 'campChecklistSavedSettings';
function loadSettings() {
  return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '[]');
}
function saveSettingsList(list) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(list));
}
function saveCurrentAsSetting(name) {
  const settings = loadSettings();
  settings.push({ id: Date.now().toString(), name, date: new Date().toISOString(), itemIds: [...checkedIds] });
  saveSettingsList(settings);
}
function deleteSetting(id) {
  saveSettingsList(loadSettings().filter(s => s.id !== id));
}
function applySetting(setting) {
  checkedIds.clear();
  setting.itemIds.forEach(id => { if (itemsById[id]) checkedIds.add(id); });
  saveChecked();
  Object.values(itemsById).forEach(item => { item.checked = checkedIds.has(item.id); });
  render();
}

// Collapse/expand is session-only UI state, not persisted (matches prior behavior).
const collapsedCats = new Set();
const collapsedMids = new Set();

// The category/mid/sub tree is fixed by CATEGORY_CONFIG (categories.js), not
// user-editable. Items are the shared Firestore catalog, keyed by their
// "대분류›중분류›소분류" subId so renaming an entry in categories.js orphans
// items added under the old name; reordering or adding entries is safe.
// Flat itemId -> item lookup into the current `state` tree, rebuilt whenever
// state is. Lets the checkbox handler mutate the live state object in place
// (so getCheckedGroups() sees it immediately) without a full re-render.
let itemsById = {};

function buildStateFromConfig(itemsBySubId) {
  itemsById = {};
  return CATEGORY_CONFIG.map(cat => ({
    id: cat.name, name: cat.name,
    midcategories: cat.mids.map(mid => ({
      id: `${cat.name}›${mid.name}`, name: mid.name,
      subcategories: mid.subs.map(subName => {
        const subId = `${cat.name}›${mid.name}›${subName}`;
        const items = (itemsBySubId[subId] || []).map(item => {
          const full = { ...item, checked: checkedIds.has(item.id) };
          itemsById[item.id] = full;
          return full;
        });
        return { id: subId, name: subName, items };
      }),
    })),
  }));
}

let state = buildStateFromConfig({});
render();

db.collection('items').onSnapshot(snapshot => {
  const itemsBySubId = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    (itemsBySubId[data.subId] ||= []).push({ id: doc.id, text: data.text, photo: data.photo || null });
  });
  state = buildStateFromConfig(itemsBySubId);
  render();
});

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
    <div class="category-body ${collapsedCats.has(cat.id) ? 'collapsed' : ''}"></div>
  `;
  const body = div.querySelector('.category-body');
  cat.midcategories.forEach(mid => body.appendChild(renderMidcategory(mid)));
  return div;
}

function renderMidcategory(mid) {
  const div = document.createElement('div');
  div.className = 'midcategory';
  div.innerHTML = `
    <div class="midcategory-header" data-toggle-mid="${mid.id}">
      <h3>${mid.name}</h3>
    </div>
    <div class="subcategories ${collapsedMids.has(mid.id) ? 'collapsed' : ''}"></div>
  `;
  const subs = div.querySelector('.subcategories');
  mid.subcategories.forEach(sub => subs.appendChild(renderSubcategory(sub)));
  return div;
}

function renderSubcategory(sub) {
  const div = document.createElement('div');
  div.className = 'subcategory';
  div.innerHTML = `
    <div class="subcategory-header">
      <h4>${sub.name}</h4>
    </div>
    <input type="text" class="item-search-input" placeholder="🔍 제품 검색" data-action="search-item">
    <div class="items"></div>
    <div class="add-item-row">
      <input type="text" placeholder="항목 입력" data-sub="${sub.id}" class="new-item-input">
      <button data-action="add-item" data-sub="${sub.id}">추가</button>
    </div>
  `;
  const items = div.querySelector('.items');
  sub.items.forEach(item => items.appendChild(renderItem(item)));
  return div;
}

function renderItem(item) {
  const div = document.createElement('div');
  div.className = 'item-row';
  const thumb = item.photo
    ? `<img class="item-thumb" src="${item.photo}" data-action="pick-photo" data-item="${item.id}">`
    : `<span class="item-thumb empty" data-action="pick-photo" data-item="${item.id}">📷</span>`;
  div.innerHTML = `
    ${thumb}
    <label>
      <input type="checkbox" data-action="toggle-item" data-item="${item.id}" ${item.checked ? 'checked' : ''}>
      ${item.text}
    </label>
  `;
  return div;
}

// ponytail: photos are downscaled + JPEG-compressed before storing as a data
// URL on the item's Firestore doc — keeps well under Firestore's 1MiB/doc
// limit. Move to Cloud Storage (store a URL instead of inline data) if photos
// need to be larger or items grow into the thousands.
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
let pickTargetItemId = null;

photoInput.addEventListener('change', async () => {
  const file = photoInput.files[0];
  photoInput.value = '';
  if (!file || !pickTargetItemId) return;
  const dataUrl = await compressImage(file);
  db.collection('items').doc(pickTargetItemId).update({ photo: dataUrl });
});

categoriesEl.addEventListener('click', e => {
  const toggleHeader = e.target.closest('[data-toggle]');
  if (toggleHeader) {
    const id = toggleHeader.dataset.toggle;
    collapsedCats.has(id) ? collapsedCats.delete(id) : collapsedCats.add(id);
    render();
    return;
  }

  const toggleMidHeader = e.target.closest('[data-toggle-mid]');
  if (toggleMidHeader) {
    const id = toggleMidHeader.dataset.toggleMid;
    collapsedMids.has(id) ? collapsedMids.delete(id) : collapsedMids.add(id);
    render();
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, sub: subId, item: itemId } = btn.dataset;

  if (action === 'add-item') {
    const input = categoriesEl.querySelector(`.new-item-input[data-sub="${subId}"]`);
    addItem(subId, input);
  } else if (action === 'pick-photo') {
    pickTargetItemId = itemId;
    photoInput.click();
  }
});

categoriesEl.addEventListener('change', e => {
  if (e.target.dataset.action !== 'toggle-item') return;
  const itemId = e.target.dataset.item;
  e.target.checked ? checkedIds.add(itemId) : checkedIds.delete(itemId);
  saveChecked();
  if (itemsById[itemId]) itemsById[itemId].checked = e.target.checked;
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
  addItem(e.target.dataset.sub, e.target);
});

function addItem(subId, input) {
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  db.collection('items').add({ subId, text, photo: null, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
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
            ${i.photo ? `<img src="${i.photo}">` : `<div class="no-photo">${CATEGORY_ICONS[cat.name] || '⛺'}</div>`}
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

document.getElementById('save-setting-btn').addEventListener('click', () => {
  if (!checkedIds.size) { alert('체크된 항목이 없습니다.'); return; }
  const name = prompt('세팅 이름을 입력하세요 (예: 빈티지 캠핑)');
  if (!name || !name.trim()) return;
  saveCurrentAsSetting(name.trim());
  alert('저장되었습니다.');
});

function renderSettingsList() {
  const settings = loadSettings();
  settingsList.innerHTML = '';
  if (!settings.length) {
    settingsList.innerHTML = '<p class="empty-msg">저장된 세팅이 없습니다.</p>';
    return;
  }
  settings.slice().reverse().forEach((setting, i) => {
    const div = document.createElement('div');
    div.className = 'setting-card';
    const dateStr = new Date(setting.date).toLocaleDateString('ko-KR');
    const tagColor = SETTING_TAG_COLORS[i % SETTING_TAG_COLORS.length];
    div.innerHTML = `
      <div class="setting-info" data-action="load-setting" data-id="${setting.id}">
        <div class="setting-tag" style="background:${tagColor}">🏕️</div>
        <div>
          <div class="setting-name">${setting.name}</div>
          <div class="setting-date">${dateStr}</div>
        </div>
      </div>
      <button data-action="delete-setting" data-id="${setting.id}">삭제</button>
    `;
    settingsList.appendChild(div);
  });
}

document.getElementById('settings-btn').addEventListener('click', () => {
  renderSettingsList();
  editView.hidden = true;
  settingsView.hidden = false;
});

document.getElementById('settings-back-btn').addEventListener('click', () => {
  settingsView.hidden = true;
  editView.hidden = false;
});

settingsList.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const setting = loadSettings().find(s => s.id === btn.dataset.id);
  if (!setting) return;

  if (btn.dataset.action === 'load-setting') {
    applySetting(setting);
    settingsView.hidden = true;
    editView.hidden = false;
  } else if (btn.dataset.action === 'delete-setting') {
    if (!confirm(`"${setting.name}" 세팅을 삭제할까요?`)) return;
    deleteSetting(setting.id);
    renderSettingsList();
  }
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
    const catIcon = CATEGORY_ICONS[cat.name] || '⛺';
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
            ctx.fillText(catIcon, x + CARD / 2, cardY + CARD / 2 + 10);
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
