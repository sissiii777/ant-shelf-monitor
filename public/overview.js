import { SHELVES, ATTRIBUTES, unique, summarize, isConfirmed } from './model.js';
import { initializeShelfPages, openShelf } from './shelves.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const fmt = value => value.toLocaleString('zh-CN');
const arrow = '<span aria-hidden="true">↗</span>';
let dataset;
let scope = 'snapshot';
let expanded = false;
let summary;
let lastFocus;

function badge(text, kind = '') { return `<span class="badge ${kind}">${escape(text)}</span>`; }
function rowButton(content, action, extra = '') { return `<button type="button" class="chart-row ${extra}" ${action}>${content}</button>`; }
function heading(title, subtitle, action = '') { return `<div class="panel-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${action}</div>`; }
function axis(max) { return `<div class="axis"><span>0</span><span>${Math.ceil(max / 2)}</span><span>${max} 只</span></div>`; }
function metricCard(label, number, unit, description, action = '', extra = '') {
  return `<${action ? 'button type="button"' : 'div'} class="metric-card ${extra}" ${action}><span class="metric-label">${label}</span><div class="metric-value">${number}<small>${unit}</small></div></${action ? 'button' : 'div'}>`;
}

function render() {
  summary = summarize(dataset, scope, 'products');
  const root = document.getElementById('overview');
  const incoming = unique(summary.changes.filter(item => item.status === '入池').map(item => item.code)).length;
  const outgoing = unique(summary.changes.filter(item => item.status === '出池').map(item => item.code)).length;
  const unresolved = summary.relations.filter(item => item.status === '待核实').length;
  root.innerHTML = `<div class="overview-heading"><h1>基金公司货架布局总览</h1></div>
  <div class="metrics-grid" aria-label="宏观指标">
  ${metricCard('在榜产品总数', fmt(summary.products.length), '只', '已确认关系 · 基金代码全局去重', 'data-action="all"')}
  ${metricCard('上榜总席位数', fmt(summary.seats.length), '个', '产品 × 一级货架去重', 'data-action="seats"')}
  ${metricCard('在榜公司数', fmt(summary.companies.length), '家', '名称归一口径 · 至少一只在榜产品')}
  ${metricCard('产品出入动态', `<span class="change-group"><span class="change-in">${incoming}</span><small>个入池</small></span><span class="change-group"><span class="change-out">${outgoing}</span><small>个出池</small></span>`, '', '', 'data-action="changes"')}
  ${metricCard('跨榜单产品数', fmt(summary.cross.length), '只', '确认覆盖至少两个一级货架', 'data-action="cross"', 'accent-card')}
  </div>
  <div class="section-label"><h2>货架分类概况</h2><span>五类一级货架 · 点击查看明细</span></div>
  <div class="shelf-grid">${summary.shelves.map(shelf => `<button class="shelf-card" data-shelf="${escape(shelf.name)}"><span class="shelf-top">${arrow}</span><h3>${shelf.name}</h3>${shelf.unknown ? `<div class="shelf-unknown">名单待核实</div><p>产品数、公司数暂不计算</p>` : `<div class="shelf-number">${shelf.products}<small>只</small><span>覆盖 ${shelf.companies} 家公司</span></div>`}<div class="shelf-children">${shelf.children.map(child => `<span>${child.name}<b>${shelf.unknown ? '?' : child.count}</b></span>`).join('')}${!shelf.children.length ? '<span class="neutral">暂无二级分类</span>' : ''}${!shelf.unknown && shelf.unclassified && shelf.children.length ? `<span class="unresolved">分类待核实<b>${shelf.unclassified}</b></span>` : ''}</div></button>`).join('')}</div>
  <div class="analysis-grid">
    <article class="panel">${heading('公司上榜数排名', '按产品数 · 前10家公司 + 华安 · 同数量并列排名')}${ranking()}</article>
    <article class="panel">${heading('公司 × 货架分布热力图', '公司顺序与排名一致 · 数量单位：只', `<button class="secondary compact" data-action="expand" aria-pressed="${expanded}">${expanded ? '收起二级分类' : '展开二级分类'}</button>`)}${heatmap()}</article>
    <article class="panel">${heading('各货架产品数与公司覆盖', '按已确认产品数排序 · 公司覆盖另列展示')}${shelfChart()}</article>
    <article class="panel">${heading('各公司产品结构', '每只在榜产品仅分配一个属性 · 不按席位重复')}${structure()}</article>
    <article class="panel style-panel">${heading('风格化固收+布局', '按原表风格化名单收录，纳入上榜统计')}${styles()}</article>
    <article class="panel">${heading('本期入池 / 出池', '仅使用原表明确标记 · 不推算历史变动')}${changesTable(summary.changes)}</article>
  </div><div class="overview-footer"><span>来源：${escape(dataset.meta.sourceFile)}</span><span>${unresolved} 条关系待核实 · 份额尚未合并 · 无可比历史期</span></div>`;
}

function ranking() {
  const max = Math.max(1, ...summary.displayed.map(company => company.products));
  return `<div class="ranking-chart">${summary.displayed.map(company => rowButton(`<span class="rank-number">${company.rank}</span><span class="company-label">${escape(company.name)}</span><span class="bar-track"><span class="bar-fill" style="width:${company.products / max * 100}%"></span></span><b>${company.products}<small>只</small></b>`, `data-company="${escape(company.name)}" title="${escape(company.name)}｜第${company.rank}名｜产品${company.products}只｜覆盖${company.shelves}类货架"`, company.name === '华安' ? 'huaan' : '')).join('')}${axis(max)}</div>`;
}

function heatmap() {
  const columns = expanded ? summary.shelves.flatMap(shelf => shelf.children.length ? [...shelf.children.map(child => ({ shelf: shelf.name, sub: child.name, label: child.name })), ...(shelf.unclassified ? [{ shelf: shelf.name, sub: null, label: '待核实' }] : [])] : [{ shelf: shelf.name, label: '全部' }]) : SHELVES.map(shelf => ({ shelf: shelf.name, label: shelf.short }));
  const values = summary.displayed.flatMap(company => columns.map(column => unique(company.covered.filter(row => row.shelf === column.shelf && (!expanded || !('sub' in column) || row.sub === column.sub)).map(row => row.code)).length));
  const max = Math.max(1, ...values);
  const groups = expanded ? `<tr><th rowspan="2" scope="col">公司</th>${summary.shelves.map(shelf => `<th scope="colgroup" colspan="${columns.filter(column => column.shelf === shelf.name).length}">${shelf.name}</th>`).join('')}</tr><tr>` : '<tr><th scope="col">公司</th>';
  return `<div class="heatmap-scroll"><table class="heatmap"><thead>${groups}${columns.map(column => `<th scope="col">${column.label}</th>`).join('')}</tr></thead><tbody>${summary.displayed.map(company => `<tr class="${company.name === '华安' ? 'huaan-row' : ''}"><th scope="row">${escape(company.name)}</th>${columns.map(column => {
    const rows = company.covered.filter(row => row.shelf === column.shelf && (!expanded || !('sub' in column) || row.sub === column.sub));
    const count = unique(rows.map(row => row.code)).length;
    const pending = summary.relations.some(row => row.company === company.name && row.shelf === column.shelf && row.status === '待核实');
    const unknown = summary.shelves.find(shelf => shelf.name === column.shelf).unknown || (!count && pending);
    const level = unknown ? 'unknown' : count ? `level-${Math.min(5, Math.max(1, Math.ceil(count / max * 5)))}` : 'zero';
    return `<td><button class="heat-cell ${level}" data-cell-company="${escape(company.name)}" data-cell-shelf="${escape(column.shelf)}" ${'sub' in column ? `data-cell-sub="${escape(column.sub ?? '__unknown') }"` : ''} aria-label="${escape(company.name)} ${escape(column.shelf)} ${escape(column.label)} ${unknown ? '名单待核实' : `${count}只`}">${unknown ? '?' : count || '—'}</button></td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div><div class="heat-legend"><span>少</span>${[1, 2, 3, 4, 5].map(level => `<i class="level-${level}"></i>`).join('')}<span>多（按本图最大值分级）</span></div>`;
}

function shelfChart() {
  const sorted = [...summary.shelves].sort((first, second) => Number(first.unknown) - Number(second.unknown) || second.products - first.products);
  const max = Math.max(1, ...sorted.map(shelf => shelf.products));
  return `<div class="shelf-bars">${sorted.map(shelf => `<button class="shelf-bar-row" data-shelf="${shelf.name}"><span>${shelf.name}</span><span class="bar-track"><span class="bar-fill" style="width:${shelf.unknown ? 0 : shelf.products / max * 100}%"></span></span><span>${shelf.unknown ? badge('名单待核实', 'pending') : `<b>产品 ${shelf.products} 只</b><small>覆盖公司 ${shelf.companies} 家</small>`}</span></button>`).join('')}<div class="shelf-axis"><span>0</span><span>产品数（只） · 最大 ${max}</span></div></div>`;
}

function structure() {
  const max = Math.max(1, ...summary.displayed.map(company => company.products));
  return `<div class="structure-legend">${ATTRIBUTES.map((name, index) => `<span><i class="attribute-${index}"></i>${name}</span>`).join('')}</div><div class="structure-chart">${summary.displayed.map(company => `<button class="structure-row ${company.name === '华安' ? 'huaan' : ''}" data-company="${escape(company.name)}"><span>${escape(company.name)}</span><span class="stack-track">${ATTRIBUTES.map((name, index) => {
    const count = company.owned.filter(product => product.attribute === name).length;
    return count ? `<span class="attribute-${index}" style="width:${count / max * 100}%" title="${escape(name)}：${count}只">${count / max > .085 ? count : ''}</span>` : '';
  }).join('')}</span><b>${company.products}<small>只</small></b></button>`).join('')}<div class="shelf-axis"><span>0</span><span>产品数（只） · 最大 ${max}</span></div></div>`;
}

function styles() {
  const styleShelf = summary.shelves.find(shelf => shelf.name === '风格化固收+');
  if (!styleShelf.rows.length) return '<div class="no-records">当前数据范围未纳入风格化名单</div>';
  return `<div class="style-grid">${['科技', '红利', '量化', '资源'].map(name => {
    const rows = styleShelf.rows.filter(row => row.sub === name);
    return `<section class="style-card"><div class="style-card-title"><h3>${name}</h3>${badge('名单收录', 'soft')}</div><p class="style-count"><b>${unique(rows.map(row => row.code)).length}</b> 只产品 <span>／ ${unique(rows.map(row => row.company)).length} 家公司</span></p><ul>${rows.map(row => `<li><span class="style-company ${row.company === '华安' ? 'huaan-text' : ''}">${escape(row.company)}</span><span>${escape(row.name)}<small>${row.code}</small></span></li>`).join('')}</ul></section>`;
  }).join('')}</div>`;
}

function changesTable(rows) {
  return rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr>${['状态', '公司 / 产品名称', '基金代码', '一级货架', '二级分类', '数据日期'].map(title => `<th scope="col">${title}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><td>${badge(row.status, row.status === '入池' ? 'incoming' : 'outgoing')}</td><td><strong>${escape(row.company ?? '待核实')}</strong><span class="table-product">${escape(row.name)}</span></td><td class="code">${row.code}</td><td>${escape(row.shelf ?? '原表未标注')}</td><td>${escape(row.sub ?? '待核实')}</td><td>${row.source.dataDate ?? '待核实'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="no-records">当前范围暂无明确标注的入池 / 出池记录</div>';
}

function relationTable(rows) {
  return rows.length ? `<div class="table-scroll"><table class="data-table"><thead><tr>${['公司 / 产品', '基金代码', '一级货架', '二级分类', '状态', '来源 / 日期'].map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr><td><strong>${escape(row.company ?? '待核实')}</strong><span class="table-product">${escape(row.name)}</span></td><td class="code">${row.code}</td><td>${escape(row.shelf ?? '待核实')}</td><td>${escape(row.sub ?? (row.shelf === '金选理财+' ? '不适用' : '待核实'))}${row.issue ? `<small class="issue-text">${escape(row.issue)}</small>` : ''}</td><td>${badge(row.status, row.status === '待核实' ? 'pending' : 'soft')}</td><td>${escape(row.source.sheet)} · 第${row.source.row}行<small>名单日期：${row.source.dataDate ?? '待核实'}</small><small>原始货架：${escape(row.source.rawShelf || '空白')}<br>原始分类：${escape(row.source.rawClass || '空白')} · 原始状态：${escape(row.source.rawStatus || '空白')}</small></td></tr>`).join('')}</tbody></table></div>` : '<div class="no-records">当前范围没有确认记录</div>';
}

function showDialog(title, html) {
  lastFocus = document.activeElement;
  const dialog = document.getElementById('detailDialog');
  document.getElementById('detailTitle').textContent = title;
  document.getElementById('detailBody').innerHTML = html;
  dialog.showModal();
}

function crossMatrix() {
  const pendingCodes = summary.relations.filter(row => row.status === '待核实' && summary.products.some(product => product.code === row.code)).map(row => row.code);
  const products = summary.products.filter(product => summary.cross.includes(product) || pendingCodes.includes(product.code));
  return `<p class="dialog-note">确认跨榜单 ${summary.cross.length} 只。另列含待核实关系的在榜产品供核验，“？”不计入覆盖数。金选固收+名单未确认。</p><div class="table-scroll"><table class="data-table"><thead><tr><th>公司 / 产品</th><th>基金代码</th>${SHELVES.map(shelf => `<th>${shelf.name}</th>`).join('')}<th>覆盖数</th></tr></thead><tbody>${products.map(product => {
    let coverage = 0;
    const cells = SHELVES.map(shelf => {
      const rows = summary.relations.filter(row => row.code === product.code && row.shelf === shelf.name);
      if (rows.some(isConfirmed)) { coverage += 1; return `<td>${shelf.name === '风格化固收+' ? badge('名单收录', 'soft') : '✓'}</td>`; }
      return `<td>${summary.shelves.find(item => item.name === shelf.name).unknown || rows.some(row => row.status === '待核实') ? '?' : '—'}</td>`;
    }).join('');
    return `<tr><td><strong>${escape(product.company)}</strong><span class="table-product">${escape(product.name)}</span></td><td class="code">${product.code}</td>${cells}<td><b>${coverage}</b></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function method() {
  return `<div class="method-copy"><h3>统计范围与时间</h3><p>${escape(dataset.meta.dateNote)}</p><p>当前所有模块共用页面的数据范围。未知名单日期不冒充统一统计日；没有可比历史数据，不生成变化率、趋势或排名变化。</p><h3>产品与席位</h3><p>以6位基金代码识别产品；尚未确认A/C/E主产品映射，未合并份额。产品全局去重；席位按产品＋一级货架去重。二级分类不增加一级席位。</p><h3>状态与公司</h3><p>留池、入池计入当前确认关系；出池仅保留变动。风格化名单以“名单收录”参与产品、席位和公司排名。公司按产品名称前缀归一（兴全→兴证全球等），管理人法人主体尚待核验；不据名称推断风险属性。</p><h3>分类与异常</h3><p>${escape(dataset.meta.goldIncomeBasis)}</p><p>${escape(dataset.meta.goldFixedIncomeStatus)}</p><p>极低波只作为属性。二级归属冲突不增加上榜次数；归入分类待核实。属性冲突或缺失统一进入未分类。</p><h3>读取工作表</h3><ul>${dataset.meta.scannedSheets.map(sheet => `<li>${escape(sheet.sheet)}：${sheet.fundRows} 条基金代码记录 · ${sheet.role}</li>`).join('')}</ul><p class="module-note">文件校验 SHA-256：${dataset.meta.sha256}</p></div>`;
}

function audit() {
  const data = dataset.audit;
  return `<div class="method-copy"><h3>导入核验</h3><p>两张主表确认：${data.primaryCodes} 个不同基金代码；合并风格化名单：${data.combinedCodes} 个代码、${data.combinedSeats} 个一级席位。风格化 ${data.styleCodes} 只，${data.styleCompanies} 家公司。</p><h3>与提供核验值的差异</h3><p>当前附件“求赚安稳盈”的明确所属货架列计算结果：${Object.entries(data.primarySubcounts).map(([name, count]) => `${name} ${count} 只`).join('、')}。与提供的安77／稳34／盈37不一致，总量一致。系统保留原始行值，不按预期数字改写分类。</p><h3>二级分类冲突</h3>${relationTable(summary.relations.filter(row => row.issue))}<h3>状态待核实</h3>${relationTable(summary.relations.filter(row => row.status === '待核实'))}</div>`;
}

function showShelf(name) {
  openShelf(name);
}

function showCompany(name) {
  const company = summary.companies.find(item => item.name === name);
  document.getElementById('companies').innerHTML = `<div class="overview-heading"><div><h1>${escape(name)} ${name === '华安' ? badge('本公司', 'soft') : ''}</h1><p>${company.products}只在榜产品 · ${company.seats}个席位 · 覆盖${company.shelves}类一级货架</p></div><a class="secondary" href="#overview">返回总览</a></div><article class="panel">${heading('货架布局明细', '')}${relationTable(summary.relations.filter(row => row.company === name))}</article>`;
  window.location.hash = 'companies';
}

document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.action === 'retry') { load(); return; }
  if (!dataset) return;
  if (target.dataset.shelf) showShelf(target.dataset.shelf);
  else if (target.dataset.company) showCompany(target.dataset.company);
  else if (target.dataset.cellShelf) {
    const sub = target.dataset.cellSub;
    const rows = summary.confirmed.filter(row => row.company === target.dataset.cellCompany && row.shelf === target.dataset.cellShelf && (sub === undefined || row.sub === (sub === '__unknown' ? null : sub)));
    showDialog(`${target.dataset.cellCompany} · ${target.dataset.cellShelf}`, summary.shelves.find(shelf => shelf.name === target.dataset.cellShelf).unknown ? '<p>独立名单来源和范围待核实，暂不计算产品数量。</p>' : relationTable(rows));
  } else if (target.dataset.action === 'expand') { expanded = !expanded; render(); }
  else if (target.dataset.action === 'cross') showDialog('跨榜单产品覆盖矩阵', crossMatrix());
  else if (target.dataset.action === 'method') showDialog('统计口径与来源', method());
  else if (target.dataset.action === 'audit') showDialog('导入核验与异常', audit());
  else if (target.dataset.action === 'changes') showDialog('本期明确变动记录', changesTable(summary.changes));
  else if (target.dataset.action === 'all') showDialog('确认在榜产品及来源', relationTable(summary.confirmed));
  else if (target.dataset.action === 'seats') showDialog('一级货架席位构成', `<div class="seat-breakdown">${summary.shelves.map(shelf => `<p><strong>${shelf.name}</strong><span>${shelf.unknown ? '名单待核实' : `${shelf.products} 个席位`}</span></p>`).join('')}</div>${relationTable(summary.confirmed)}`);
  else if (target.dataset.action === 'retry') load();
});
const dialog = document.getElementById('detailDialog');
dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { if (lastFocus?.isConnected) lastFocus.focus(); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });

async function load() {
  const root = document.getElementById('overview');
  root.innerHTML = '<div class="load-state" role="status">正在读取货架名单…</div><div class="metrics-grid" aria-hidden="true">' + '<div class="skeleton"></div>'.repeat(5) + '</div>';
  try {
    const response = await fetch('./data/shelves.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dataset = await response.json();
    if (!Array.isArray(dataset.products) || !Array.isArray(dataset.relations)) throw new Error('名单格式异常');
    const updated = document.getElementById('navUpdated');
    const importedAt = new Date(dataset.meta.importedAt);
    if (!Number.isNaN(importedAt.getTime())) {
      updated.dateTime = importedAt.toISOString();
      updated.textContent = `数据更新：${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(importedAt)}`;
      window.dispatchEvent(new Event('resize'));
    }
    initializeShelfPages(dataset);
    render();
  } catch (error) {
    root.innerHTML = `<div class="load-error" role="alert"><h1>名单加载失败</h1><p>${escape(error.message)}</p><button class="secondary" data-action="retry">重新加载</button></div>`;
  }
}
load();
