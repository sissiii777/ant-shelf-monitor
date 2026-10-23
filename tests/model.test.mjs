import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SHELVES, summarize } from '../public/model.js';

const data = JSON.parse(await readFile(new URL('../public/data/shelves.json', import.meta.url), 'utf8'));

test('source reconciliation includes style and one confirmed cross-list product', () => {
  const result = summarize(data);
  assert.equal(result.products.length, 208);
  assert.equal(result.seats.length, 265);
  assert.ok(result.cross.some(product => product.code === '180015'));
  assert.equal(summarize(data, 'primary').products.length, 187);
  assert.equal(summarize(data, 'style').products.length, 11);
  assert.equal(summarize(data, 'style').companies.length, 9);
  const gold = result.shelves.find(shelf => shelf.name === '金选固收+');
  assert.equal(gold.unknown, false);
  assert.equal(gold.products, 67);
  assert.equal(gold.unclassified, 0);
  assert.equal(gold.children.find(child => child.name === '极低波').count, 5);
  assert.equal(gold.children.find(child => child.name === '低波').count, 35);
  assert.equal(gold.children.find(child => child.name === '中波').count, 15);
  assert.equal(gold.children.find(child => child.name === '高波').count, 17);
  assert.ok(data.relations.some(row => row.shelf === '金选固收+' && row.sub === '极低波'));
  assert.ok(data.relations.filter(row => row.shelf === '金选固收+').every(row => row.status === '名单收录' && row.source.rawStatus === null));
  assert.equal(result.shelves.find(shelf => shelf.name === '金选收益+').products, 30);
  assert.equal(result.shelves.find(shelf => shelf.name === '金选理财+').products, 9);
});

test('unknown relationships are excluded and source rows remain traceable', () => {
  const result = summarize(data);
  const huaan = result.products.find(product => product.code === '019807');
  assert.ok(huaan);
  assert.equal(result.confirmed.filter(row => row.code === huaan.code).length, 1);
  assert.ok(result.relations.some(row => row.code === huaan.code && row.shelf === '金选收益+' && row.status === '待核实'));
  assert.deepEqual(result.changes.map(row => row.code).sort(), ['006995', '016694', '018691']);
  assert.equal(result.changes.find(row => row.code === '016694').shelf, null);
  for (const row of data.relations) {
    assert.match(row.code, /^\d{6}$/);
    assert.ok(row.source.sheet && Number.isInteger(row.source.row));
    assert.equal(row.source.dataDate, null);
  }
  assert.equal(data.meta.listDate, null);
});

test('confirmed dual secondary listings count in both groups but only one primary seat', () => {
  const result = summarize(data);
  const rows = result.confirmed.filter(row => row.code === '013225' && row.shelf === '金选收益+');
  assert.deepEqual(rows.map(row => row.sub).sort(), ['季季', '年年']);
  assert.ok(rows.every(row => row.multipleSubclassesConfirmed && !row.issue));
  assert.equal(result.seats.filter(seat => seat === '013225|金选收益+').length, 1);
  const shelf = result.shelves.find(item => item.name === '金选收益+');
  assert.equal(shelf.products, 30);
  assert.equal(shelf.unclassified, 0);
  assert.ok(shelf.children.reduce((total, child) => total + child.count, 0) > shelf.products);
});

test('deduplication, conflicts, tied ranks and company totals', () => {
  const source = { sheet: 'test', row: 1, dataDate: null };
  const relation = (code, company, shelf, sub, status = '留池') => ({ code, company, shelf, sub, status, source });
  const fixture = { products: [
    { code: '000001', company: '华安', attribute: '极低波' },
    { code: '000002', company: '甲', attribute: '未分类' },
    { code: '000003', company: '乙', attribute: '低波' },
    { code: '000004', company: '丙', attribute: '低波' },
  ], relations: [
    relation('000001', '华安', '稳健理财', '稳理财'),
    relation('000001', '华安', '稳健理财', '稳理财'),
    relation('000001', '华安', '稳健理财', '盈理财'),
    relation('000001', '华安', '风格化固收+', '科技', '名单收录'),
    relation('000002', '甲', '稳健理财', '安理财'),
    relation('000003', '乙', '金选收益+', '月月'),
    relation('000004', '丙', '金选收益+', '月月', '待核实'),
  ] };
  const result = summarize(fixture);
  assert.equal(result.products.length, 3);
  assert.equal(result.seats.length, 4);
  assert.equal(result.cross.length, 1);
  assert.equal(result.shelves[0].unclassified, 1);
  assert.equal(result.shelves[0].children.find(child => child.name === '稳理财').count, 0);
  assert.equal(result.companies.reduce((total, company) => total + company.products, 0), result.products.length);
  assert.equal(result.companies.reduce((total, company) => total + company.seats, 0), result.seats.length);
  assert.deepEqual(result.companies.map(company => company.rank), [1, 1, 1]);
  assert.equal(result.companies.find(company => company.name === '华安').seats, 2);
});

test('all rendered ranking companies share a single order and exclusive product attributes', () => {
  for (const metric of ['products', 'seats']) {
    const result = summarize(data, 'snapshot', metric);
    assert.equal(result.displayed.filter(company => company.name === '华安').length, 1);
    for (const company of result.companies) {
      assert.equal(company.rank, 1 + result.companies.filter(other => other[metric] > company[metric]).length);
      assert.equal(new Set(company.owned.map(product => product.code)).size, company.products);
    }
  }
  assert.equal(SHELVES.length, 5);
  assert.deepEqual(SHELVES[3].children, ['极低波', '低波', '中波', '高波']);
});
