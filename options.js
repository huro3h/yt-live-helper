// 絞り込み条件の編集画面。保存先は chrome.storage.local の liveFilters
// ([{name, url, keywords, enabled}]。url は改行区切りで複数入れられる。
// 並び順は表示順だけで、判定には関係しない)。
// 条件ごとの ON/OFF はポップアップからも切り替わるので、ほかの画面での変更も反映する。
const filterList = document.getElementById('filterList');
const filterEmpty = document.getElementById('filterEmpty');
const addFilterButton = document.getElementById('addFilter');

let filters = [];
// 自分で保存した値。storage.onChanged で戻ってきたときに、入力中の欄を描き直さないため
let lastSaved = null;

function readFilters(value) {
  if (!Array.isArray(value)) return [];
  const text = (v) => (typeof v === 'string' ? v : '');
  return value
    .filter((filter) => filter && typeof filter === 'object')
    .map((filter) => ({
      name: text(filter.name),
      url: text(filter.url),
      keywords: text(filter.keywords),
      enabled: filter.enabled !== false,
    }));
}

// 入力のたびに保存する（タブを閉じたときに取りこぼさないため）
function save() {
  lastSaved = JSON.stringify(filters);
  chrome.storage.local.set({ liveFilters: filters });
}

function field(label, element, hint) {
  const wrap = document.createElement('label');
  const caption = document.createElement('span');
  caption.className = 'field-label';
  caption.textContent = label;
  wrap.append(caption, element);
  if (hint) {
    const note = document.createElement('div');
    note.className = 'hint';
    note.textContent = hint;
    wrap.appendChild(note);
  }
  return wrap;
}

function render() {
  filterEmpty.hidden = filters.length > 0;
  filterList.textContent = '';
  filters.forEach((filter, index) => {
    const card = document.createElement('div');
    card.className = 'filter-card';

    const head = document.createElement('div');
    head.className = 'card-head';
    const toggle = document.createElement('div');
    toggle.className = 'toggle';
    toggle.classList.toggle('on', filter.enabled);
    toggle.title = 'この条件を使う';
    toggle.addEventListener('click', () => {
      filter.enabled = !filter.enabled;
      toggle.classList.toggle('on', filter.enabled);
      save();
    });
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'text-input';
    name.placeholder = '名前（ポップアップに表示されます）';
    name.value = filter.name;
    name.addEventListener('input', () => {
      filter.name = name.value;
      save();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn remove';
    remove.textContent = '削除';
    remove.addEventListener('click', () => {
      filters = filters.filter((_, i) => i !== index);
      render();
      save();
    });
    head.append(toggle, name, remove);
    card.appendChild(head);

    const url = document.createElement('textarea');
    url.className = 'text-input urls';
    url.spellcheck = false;
    url.placeholder = 'https://www.youtube.com/channel/...';
    url.value = filter.url;
    url.addEventListener('input', () => {
      filter.url = url.value;
      save();
    });
    card.appendChild(
      field(
        'トピックのチャンネルURL（任意）',
        url,
        '1行に1つ。どれかと一致すれば条件に合います。空欄なら、キーワードだけで判定します'
      )
    );

    const keywords = document.createElement('textarea');
    keywords.className = 'text-input';
    keywords.spellcheck = false;
    keywords.value = filter.keywords;
    keywords.addEventListener('input', () => {
      filter.keywords = keywords.value;
      save();
    });
    card.appendChild(
      field('キーワード', keywords, '1行に1つ、またはカンマ（,）・読点（、）で区切って入力します')
    );

    filterList.appendChild(card);
  });
}

addFilterButton.addEventListener('click', () => {
  filters = [...filters, { name: '', url: '', keywords: '', enabled: true }];
  render();
  save();
  filterList.querySelector('.filter-card:last-child .card-head input')?.focus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.liveFilters) return;
  const next = readFilters(changes.liveFilters.newValue);
  if (JSON.stringify(next) === lastSaved) return; // 自分の保存が戻ってきただけ
  filters = next;
  render();
});

chrome.storage.local.get('liveFilters', (stored) => {
  filters = readFilters(stored.liveFilters);
  render();
});
