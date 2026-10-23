import { SHELVES, unique } from './model.js';
import { shelfRows } from './shelf-model.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fieldOrder = ['manager', 'established', 'holding', 'annualized', 'daily', 'week', 'month', 'quarter', 'halfYear', 'year', 'threeYears', 'ytd', 'benchmark', 'benchmark3y', 'drawdown', 'ytdDrawdown', 'maxDrawdown1y', 'maxDrawdown2y', 'size', 'fundType', 'managementFee', 'custodian', 'stockWeight', 'convertibleWeight', 'strategy', 'riskLabel', 'tag'];
let data;
let currentShelf = '稳健理财';
let currentSub = '安理财';
let view = 'current';
let search = '';
let sortKey = '';
let direction = 'asc';
let searchTimer;
let compared = [];
let shownProduct;
try { compared = JSON.parse(sessionStorage.getItem('shelf-comparisons') || '[]'); } catch { compared = []; }
if (!Array.isArray(compared)) compared = [];

function fieldValue(cell, definition) {
  if (!cell || cell.status === 'missing') return '<span class="cell-missing">待核实</span>';
  if (cell.status === 'error') return '<span class="cell-error" title="原表公式错误或抓取失败">数据异常</span>';
  if (cell.status === 'conflict') return '<span class="cell-missing">待核实</span>';
  const formatted = typeof cell.value === 'number' ? escape(cell.value.toLocaleString('zh-CN', { minimumFractionDigits: definition.key === 'holding' ? 0 : 2, maximumFractionDigits: definition.key === 'holding' ? 0 : 2 })) : escape(cell.value);
  return formatted + (cell.reportDate && !definition.key.startsWith('exposure_') ? `<span class="field-report-date">${escape(cell.reportDate)}</span>` : '');
}

function currentData() { return shelfRows(data, currentShelf, currentSub || null, view, search, sortKey, direction); }
function selected(code) { return compared.some(item => item.code === code); }

export function initializeShelfPages(dataset) {
  data = dataset;
  renderComparison();
  if (location.hash.startsWith('#shelves')) route();
}

export function openShelf(shelf, sub = '') {
  const query = new URLSearchParams({ shelf, ...(sub ? { sub } : {}) });
  location.hash = `shelves?${query}`;
  route();
}

function route() {
  if (!data || !location.hash.startsWith('#shelves')) return;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const shelf = SHELVES.find(item => item.name === params.get('shelf')) || SHELVES[0];
  const sub = params.get('sub');
  const nextSub = shelf.children.includes(sub) ? sub : params.has('shelf') ? '' : shelf.children[0] || '';
  if (shelf.name !== currentShelf || nextSub !== currentSub) { view = 'current'; search = ''; sortKey = ''; direction = 'asc'; }
  currentShelf = shelf.name;
  currentSub = nextSub;
  render();
}
window.addEventListener('hashchange', route);

function metric(label, value, unit = '') {
  return `<div class="metric-card"><span class="metric-label">${label}</span><div class="metric-value">${value}${unit ? `<small>${unit}</small>` : ''}</div></div>`;
}

function render() {
  const shelf = SHELVES.find(item => item.name === currentShelf);
  const result = currentData();
  const metrics = result.metrics;
  const styleList = currentShelf === '风格化固收+';
  const listOnly = ['风格化固收+', '金选固收+'].includes(currentShelf);
  const changes = !metrics.hasChanges && listOnly ? '<span class="empty-metric">暂无变动数据</span>' : `<span class="change-group"><span class="change-in">${metrics.incoming}</span><small>只入池</small></span><span class="change-group"><span class="change-out">${metrics.outgoing}</span><small>只出池</small></span>`;
  const unknownCompany = result.confirmed.some(row => !row.company);
  document.getElementById('shelves').innerHTML = `
    <nav class="shelf-primary-tabs" aria-label="一级货架">${SHELVES.map(item => `<button type="button" data-select-shelf="${item.name}" aria-current="${item.name === currentShelf ? 'page' : 'false'}">${item.name}</button>`).join('')}</nav>
    ${shelf.children.length ? `<nav class="shelf-secondary-tabs" aria-label="二级货架"><button type="button" data-select-sub="" aria-pressed="${!currentSub}">全部</button>${shelf.children.map(name => `<button type="button" data-select-sub="${name}" aria-pressed="${currentSub === name}">${name}</button>`).join('')}</nav>` : ''}
    <div class="shelf-metrics">${metric(styleList ? '在榜产品数' : '在架产品数', metrics.count, '只')}${metric('覆盖公司数', unknownCompany ? '待核实' : metrics.companies, unknownCompany ? '' : '家')}${metric('华安在架产品数', metrics.huaan, '只')}${metric('本期变动', changes)}</div>
    <section class="panel shelf-products-panel"><div class="shelf-table-header"><h2>${escape(currentShelf)}${currentSub ? ` ${escape(currentSub)}` : ''}</h2><div class="shelf-search"><label for="shelfSearch">搜索公司、产品或基金代码</label><input type="search" id="shelfSearch" placeholder="公司 / 产品名称 / 6位代码" value="${escape(search)}" /></div></div>
    <div class="shelf-view-tabs" aria-label="记录状态"><button type="button" data-shelf-view="current" aria-pressed="${view === 'current'}">${styleList ? '当前在榜' : '当前在架'}</button><button type="button" data-shelf-view="exited" aria-pressed="${view === 'exited'}">本期出池</button></div><div id="shelfTableContainer"></div><div id="shelfResultCount" class="shelf-result-count" aria-live="polite"></div></section>
    <section class="panel shelf-rules-panel"><h2>准入规则</h2>${renderRules()}</section>`;
  renderTable();
}

function columns() {
  const keys = unique(currentData().relations.flatMap(row => Object.keys(row.fields || {})));
  return [...fieldOrder.filter(key => keys.includes(key)), ...keys.filter(key => !fieldOrder.includes(key))].map(key => data.fieldCatalog[key]).filter(Boolean).map(field => currentShelf === '稳健理财' && field.key === 'holding' ? { ...field, label: '持有期' } : field);
}

function renderTable() {
  const { rows } = currentData();
  const fields = columns();
  const header = (key, label, css = '') => `<th scope="col" class="${css}" aria-sort="${sortKey === key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'}"><button type="button" data-shelf-sort="${key}">${escape(label)}<span aria-hidden="true">${sortKey === key ? direction === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>`;
  const table = `<div class="shelf-wide-table"><table class="shelf-product-table"><colgroup><col class="company-col"><col class="product-col"><col class="code-col">${fields.map(() => '<col>').join('')}<col><col><col></colgroup><thead><tr>${header('company', '公司', 'fixed-company')}${header('name', '产品名称', 'fixed-product')}${header('code', '基金代码', 'fixed-code')}${fields.map(field => header(field.key, field.label + (field.unit ? `（${field.unit}）` : ''))).join('')}<th>行情日期</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.map(row => `<tr class="${row.company === '华安' ? 'shelf-huaan-row' : ''}"><td class="fixed-company">${escape(row.company || '待核实')}</td><td class="fixed-product"><button type="button" class="product-detail-link" data-product-code="${row.code}">${escape(row.name)}</button></td><td class="fixed-code code">${row.code}</td>${fields.map(field => `<td class="${field.type === 'number' ? 'numeric-cell' : ''}">${fieldValue(row.fields[field.key], field)}</td>`).join('')}<td>${escape(unique(row.sources.map(source => source.source.marketDate || '待核实')).join('、'))}</td><td><span class="badge ${row.status === '出池' ? 'outgoing' : row.status === '待核实' ? 'pending' : 'soft'}">${escape(row.status)}</span></td><td><button type="button" class="compare-button" data-compare-code="${row.code}" aria-pressed="${selected(row.code)}">${selected(row.code) ? '已加入对比' : '加入对比'}</button></td></tr>`).join('')}</tbody></table></div>`;
  const empty = `<div class="shelf-empty">${search ? '没有匹配的产品' : view === 'exited' ? '当前货架暂无明确归属的出池记录' : '当前货架暂无确认产品'}</div>`;
  document.getElementById('shelfTableContainer').innerHTML = rows.length ? table : empty;
  document.getElementById('shelfResultCount').textContent = `共 ${rows.length} 只产品`;
}

function renderRules() {
  const general = (data.rules || []).filter(rule => rule.shelf === currentShelf && !rule.sub);
  const specific = (data.rules || []).filter(rule => rule.shelf === currentShelf && rule.sub === currentSub && currentSub);
  const block = rule => `<article class="admission-rule"><h4>适用产品：${escape(rule.appliesTo)}</h4><dl>${rule.fields.filter(field => field.label !== '基金品类').map(field => `<div><dt>${escape(field.label)}</dt><dd>${escape(field.value)}</dd></div>`).join('')}<div><dt>建议持有期</dt><dd>${escape(rule.suggestedHolding || '待补充')}</dd></div></dl>${rule.uncertainty ? `<p class="rule-uncertainty">${escape(rule.uncertainty)}</p>` : ''}<div class="rule-source">来源：${escape(data.meta.sourceFile)} · ${escape(rule.source.sheet)}第${rule.source.row}行<br>生效日期：${escape(rule.effectiveDate || '待补充')} · 资料日期：${escape(rule.source.date || '待补充')}</div></article>`;
  return `<div class="rule-layer"><h3>一级通用规则</h3>${general.length ? general.map(block).join('') : '<div class="rule-missing">原始资料未提供本货架通用准入条件，待补充。</div>'}</div>${currentSub ? `<div class="rule-layer"><h3>${escape(currentSub)}专属规则</h3>${specific.length ? specific.map(block).join('') : '<div class="rule-missing">原始资料未明确该二级榜单的专属条件或与通用规则的对应关系，待补充。</div>'}</div>` : ''}<div class="holding-period-definition"><span>建议持有期：以上仅展示规则中明确给出的建议。</span><span>合同持有期／锁定期：需以基金合同核验；表中“原表持有期”不作为合同确认值。</span></div><p class="rule-disclaimer">准入规则不等同于收益承诺。</p>`;
}

function productDetail(code) {
  const row = currentData().rows.find(item => item.code === code);
  if (!row) return;
  shownProduct = row;
  const definitions = columns();
  const dialog = document.getElementById('detailDialog');
  const focus = document.activeElement;
  dialog.addEventListener('close', () => focus?.isConnected && focus.focus(), { once: true });
  document.getElementById('detailTitle').textContent = row.name;
  document.getElementById('detailBody').innerHTML = `<div class="product-dialog-top"><span>${escape(row.company || '待核实')} · ${row.code}</span><button class="secondary" type="button" data-compare-code="${code}">${selected(code) ? '已加入对比' : '加入对比'}</button></div><dl class="product-facts"><div><dt>所属货架</dt><dd>${escape(currentShelf)}${row.subs.length ? ` · ${escape(row.subs.join('、'))}` : ''}</dd></div><div><dt>名单日期</dt><dd>${escape(unique(row.sources.map(source => source.source.dataDate || '待核实')).join('、'))}</dd></div><div><dt>行情指标日期</dt><dd>${escape(unique(row.sources.map(source => source.source.marketDate || '待核实')).join('、'))}</dd></div><div><dt>合同持有期／锁定期</dt><dd>待补充</dd></div>${definitions.map(field => `<div><dt>${escape(field.label)}${field.unit ? `（${escape(field.unit)}）` : ''}</dt><dd>${fieldValue(row.fields[field.key], field)}</dd></div>`).join('')}</dl><h3 class="detail-source-heading">原始记录</h3><div class="product-source-list">${row.sources.map(source => `<div><strong>${escape(source.source.sheet)} · 第${source.source.row}行</strong><p>原始分类：${escape(source.source.rawClass || source.source.rawSection || '未标注')}；原始状态：${escape(source.source.rawStatus || '未标注')}；当前收录：${escape(source.status)}</p>${source.issue ? `<p class="rule-uncertainty">${escape(source.issue)}</p>` : ''}</div>`).join('')}</div>`;
  dialog.showModal();
}

function toggleCompare(code) {
  if (selected(code)) compared = compared.filter(item => item.code !== code);
  else {
    const row = currentData().rows.find(item => item.code === code) || (shownProduct?.code === code ? shownProduct : null);
    if (row) compared.push({ code: row.code, shelf: currentShelf, sub: currentSub });
  }
  try { sessionStorage.setItem('shelf-comparisons', JSON.stringify(compared)); } catch { }
  document.querySelectorAll(`[data-compare-code="${code}"]`).forEach(button => { button.textContent = selected(code) ? '已加入对比' : '加入对比'; button.setAttribute('aria-pressed', String(selected(code))); });
  renderComparison();
}

function renderComparison() {
  if (!data) return;
  const items = compared.map(item => shelfRows(data, item.shelf, item.sub || null).rows.find(row => row.code === item.code)).filter(Boolean);
  document.getElementById('comparison').innerHTML = `<div class="overview-heading"><h1>对标分析</h1><a class="secondary" href="#shelves">返回货架</a></div><article class="panel"><h2>已选产品</h2>${items.length ? `<div class="comparison-selection">${items.map(row => `<div><strong>${escape(row.name)}</strong><span>${escape(row.company)} · ${row.code}</span><button class="text-button" type="button" data-remove-compare="${row.code}">移除</button></div>`).join('')}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>指标</th>${items.map(row => `<th>${escape(row.name)}</th>`).join('')}</tr></thead><tbody>${['daily', 'month', 'year', 'drawdown', 'maxDrawdown1y', 'size', 'managementFee'].filter(key => items.some(row => row.fields[key])).map(key => `<tr><th>${escape(data.fieldCatalog[key].label)}（${escape(data.fieldCatalog[key].unit)}）</th>${items.map(row => `<td>${fieldValue(row.fields[key], data.fieldCatalog[key])}</td>`).join('')}</tr>`).join('')}<tr><th>行情指标日期</th>${items.map(row => `<td>${escape(unique(row.sources.map(source => source.source.marketDate || '待核实')).join('、'))}</td>`).join('')}</tr></tbody></table></div>` : '<div class="shelf-empty">请在货架产品表中选择“加入对比”。</div>'}</article>`;
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !data) return;
  if (button.dataset.selectShelf) openShelf(button.dataset.selectShelf);
  else if ('selectSub' in button.dataset) openShelf(currentShelf, button.dataset.selectSub);
  else if (['current', 'exited'].includes(button.dataset.shelfView)) { view = button.dataset.shelfView; render(); }
  else if (button.dataset.shelfSort) {
    direction = sortKey === button.dataset.shelfSort && direction === 'asc' ? 'desc' : 'asc';
    sortKey = button.dataset.shelfSort;
    renderTable();
  } else if (button.dataset.productCode) productDetail(button.dataset.productCode);
  else if (button.dataset.compareCode) toggleCompare(button.dataset.compareCode);
  else if (button.dataset.removeCompare) { compared = compared.filter(item => item.code !== button.dataset.removeCompare); try { sessionStorage.setItem('shelf-comparisons', JSON.stringify(compared)); } catch { } renderComparison(); }
});
document.addEventListener('input', event => {
  if (event.target.id !== 'shelfSearch') return;
  search = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderTable, 300);
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'shelfSearch' && event.key === 'Enter') { clearTimeout(searchTimer); search = event.target.value; renderTable(); }
});
