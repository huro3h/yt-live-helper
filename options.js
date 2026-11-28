const filterList = document.getElementById('filterList');
const filterEmpty = document.getElementById('filterEmpty');
const addFilterButton = document.getElementById('addFilter');

const DEFAULT_LABEL_COLOR = 'blue';
const LABEL_COLORS = [
  ['red', '赤', '#ff6b6b'],
  ['orange', 'オレンジ', '#ffa94d'],
  ['yellow', '黄', '#ffd43b'],
  ['lime', '黄緑', '#a9e34b'],
  ['green', '緑', '#51cf66'],
  ['sky', '水色', '#66d9e8'],
  ['blue', '青', '#3ea6ff'],
  ['purple', '紫', '#b197fc'],
  ['pink', 'ピンク', '#f783ac'],
  ['brown', '茶', '#c8a07a'],
  ['gray', '灰', '#aaaaaa'],
  ['black', '黒（ダークテーマでは白）', '#f1f1f1'],
];
const labelColor = (value) =>
  LABEL_COLORS.some(([key]) => key === value) ? value : DEFAULT_LABEL_COLOR;

let filters = [];
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
      color: labelColor(filter.color),
    }));
}

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

function colorPicker(filter, preview) {
  const wrap = document.createElement('div');
  wrap.className = 'swatches';
  wrap.setAttribute('role', 'radiogroup');
  const swatches = LABEL_COLORS.map(([key, label, hex]) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    swatch.style.setProperty('--swatch', hex);
    swatch.title = label;
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-label', label);
    swatch.dataset.color = key;
    swatch.addEventListener('click', () => {
      filter.color = key;
      update();
      save();
    });
    wrap.appendChild(swatch);
    return swatch;
  });
  const update = () => {
    for (const swatch of swatches) {
      swatch.setAttribute('aria-checked', String(swatch.dataset.color === filter.color));
    }
    const hex = LABEL_COLORS.find(([key]) => key === filter.color)[2];
    preview.style.setProperty('--swatch', hex);
  };
  update();
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

    const preview = document.createElement('span');
    preview.className = 'label-preview';
    const syncPreview = () => {
      preview.textContent = filter.name.trim() || '条件名';
    };
    syncPreview();
    name.addEventListener('input', syncPreview);
    const colorRow = document.createElement('div');
    colorRow.className = 'color-row';
    colorRow.append(colorPicker(filter, preview), preview);
    const colorField = document.createElement('div');
    const colorCaption = document.createElement('span');
    colorCaption.className = 'field-label';
    colorCaption.textContent = 'ラベルの色';
    const colorHint = document.createElement('div');
    colorHint.className = 'hint';
    colorHint.textContent = '別ウィンドウの一覧で、この条件に合う配信に付くラベルの色です';
    colorField.append(colorCaption, colorRow, colorHint);
    card.appendChild(colorField);

    filterList.appendChild(card);
  });
}

addFilterButton.addEventListener('click', () => {
  filters = [...filters, { name: '', url: '', keywords: '', enabled: true, color: DEFAULT_LABEL_COLOR }];
  render();
  save();
  filterList.querySelector('.filter-card:last-child .card-head input')?.focus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.liveFilters) return;
  const next = readFilters(changes.liveFilters.newValue);
  if (JSON.stringify(next) === lastSaved) return;
  filters = next;
  render();
});

chrome.storage.local.get('liveFilters', (stored) => {
  filters = readFilters(stored.liveFilters);
  render();
});
