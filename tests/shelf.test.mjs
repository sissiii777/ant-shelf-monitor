import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shelfRows } from '../public/shelf-model.js';

const data = JSON.parse(await readFile(new URL('../public/data/shelves.json', import.meta.url), 'utf8'));

test('secondary scope counts, pending toggle and search do not change inventory metrics', () => {
  const result = shelfRows(data, '稳健理财', '安理财');
  assert.equal(result.metrics.count, 79);
  assert.equal(result.metrics.huaan, 1);
  assert.equal(shelfRows(data, '稳健理财', '安理财', 'pending').metrics.count, 79);
  assert.equal(shelfRows(data, '稳健理财', '安理财', 'current', '华安').rows.length, 1);
  assert.equal(shelfRows(data, '稳健理财', '安理财', 'current', '019807').rows[0].code, '019807');
  const unknown = shelfRows(data, '金选收益+', '季季', 'pending');
  assert.ok(unknown.rows.some(row => row.code === '012229'));
  assert.equal(unknown.metrics.count, shelfRows(data, '金选收益+', '季季').metrics.count);
});

test('style naming support and secondary dedup preserve multiple listings', () => {
  assert.equal(shelfRows(data, '金选固收+', '极低波').metrics.count, 5);
  assert.equal(shelfRows(data, '金选固收+', '低波').metrics.count, 35);
  assert.equal(shelfRows(data, '金选固收+').metrics.count, 67);
  const style = shelfRows(data, '风格化固收+', '科技');
  assert.equal(style.metrics.count, 5);
  assert.equal(style.metrics.companies, 5);
  assert.equal(style.metrics.hasChanges, false);
});

test('source headers align shifted fields and formula failures are explicit', () => {
  const row = data.relations.find(item => item.source.sheet === '求赚安稳盈' && item.source.row === 94);
  assert.equal(row.fields.drawdown.cell, 'N94');
  assert.equal(row.fields.size.cell, 'Q94');
  assert.equal(row.fields.manager.cell, 'D94');
  const gold = data.relations.find(item => item.source.sheet === '求赚固收+' && item.source.row === 3);
  assert.equal(gold.fields.daily.status, 'error');
  assert.equal(gold.fields.size.status, 'error');
  assert.equal(gold.fields.size.value, null);
  assert.ok(data.rules.length > 0);
  assert.ok(data.rules.every(rule => rule.source.sheet === '求稳货架' && rule.effectiveDate === null));
  assert.ok(data.rules.find(rule => rule.source.row === 62).uncertainty);
  const style = data.relations.find(item => item.source.sheet === '风格化固收+' && item.source.row === 2);
  assert.equal(style.fields.stockWeight.reportDate, '2026-06-30');
});

test('numeric sorting keeps missing and error values last in both directions', () => {
  const source = { sheet: 'test', row: 1 };
  const fixture = { relations: [0, 1, 2, 3].map(index => ({ code: `00000${index}`, shelf: '稳健理财', sub: '安理财', status: '留池', company: '测试', name: `产品${index}`, source,
    fields: { size: index < 2 ? { status: 'ok', value: index === 0 ? 0 : 3 } : { status: index === 2 ? 'missing' : 'error', value: null } } })) };
  assert.deepEqual(shelfRows(fixture, '稳健理财', '安理财', 'current', '', 'size', 'asc').rows.map(row => row.code), ['000000', '000001', '000002', '000003']);
  assert.deepEqual(shelfRows(fixture, '稳健理财', '安理财', 'current', '', 'size', 'desc').rows.map(row => row.code), ['000001', '000000', '000002', '000003']);
});
