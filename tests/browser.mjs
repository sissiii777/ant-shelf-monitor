import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const source = await readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const server = createServer(async (request, response) => {
  const output = await worker.fetch(new Request(`http://localhost${request.url}`));
  response.writeHead(output.status, Object.fromEntries(output.headers));
  response.end(Buffer.from(await output.arrayBuffer()));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const outputDir = new URL('../../../output/overview-qa/', import.meta.url);
await mkdir(outputDir, { recursive: true });
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/#overview`);
  await page.waitForSelector('.metric-card');
  assert.equal(await page.locator('.metric-card').count(), 5);
  assert.equal(await page.locator('.shelf-card').count(), 5);
  assert.equal(await page.locator('.analysis-grid>.panel').count(), 6);
  assert.equal(await page.locator('#dataScope').count(), 0);
  assert.equal(await page.locator('#overview > .data-meta, #overview > .scope-notice').count(), 0);
  const overviewText = await page.locator('#overview').innerText();
  for (const removed of ['SHELF INTELLIGENCE', '从货架覆盖到公司布局', '数据范围', '工作簿阶段性汇总', '统计口径与来源', '名单数据日期', '数据更新时间', '当前口径', '阶段性布局快照', '当前汇总仅描述']) {
    assert.ok(!overviewText.includes(removed), `removed copy still visible: ${removed}`);
  }
  for (const width of [1920, 1440, 1200, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `overflow at ${width}px`);
    assert.equal(await page.locator('.metric-card').evaluateAll(cards => new Set(cards.map(card => card.getBoundingClientRect().top)).size), 1);
    if ([1440, 390].includes(width)) await page.screenshot({ path: fileURLToPath(new URL(`overview-${width}.png`, outputDir)), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({ path: fileURLToPath(new URL('overview-desktop-preview.png', outputDir)) });
  await page.click('[data-action="cross"]');
  await page.waitForSelector('dialog[open]');
  assert.ok((await page.locator('#detailBody').textContent()).includes('019807'));
  assert.ok((await page.locator('#detailBody').textContent()).includes('180015'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-metric]').count(), 0);
  assert.ok(!(await page.locator('.ranking-chart').innerHTML()).includes('席位'));
  await page.click('[data-action="expand"]');
  assert.ok(await page.locator('.heatmap thead th').count() > 6);
  await page.locator('.heat-cell').first().click();
  await page.waitForSelector('dialog[open]');
  await page.keyboard.press('Escape');
  await page.locator('[data-company="华安"]').first().click();
  assert.ok(page.url().endsWith('#companies'));
  assert.ok((await page.locator('#companies').textContent()).includes('华安'));
  await page.click('#companies a[href="#overview"]');
  await page.locator('.shelf-card[data-shelf="金选固收+"]').click();
  assert.ok(!(await page.locator('#shelves').textContent()).includes('名单待核实'));
  assert.ok((await page.locator('#shelves').textContent()).includes('极低波'));
  await page.click('a[data-page="overview"]');
  assert.ok((await page.locator('.metric-card').first().textContent()).includes('208'));
  for (const [shelf, sub] of [
    ['稳健理财','安理财'], ['稳健理财','稳理财'], ['稳健理财','盈理财'],
    ['金选收益+','年年'], ['金选收益+','季季'], ['金选收益+','月月'], ['金选理财+',''],
    ['金选固收+','极低波'], ['金选固收+','低波'], ['金选固收+','中波'], ['金选固收+','高波'],
    ['风格化固收+','科技'], ['风格化固收+','红利'], ['风格化固收+','量化'], ['风格化固收+','资源'],
  ]) {
    await page.goto(`http://127.0.0.1:${server.address().port}/#shelves?${new URLSearchParams({shelf,sub})}`);
    await page.waitForSelector('.shelf-metrics');
    assert.equal(await page.locator('.shelf-metrics>.metric-card').count(), 4);
    assert.ok(await page.locator('.shelf-product-table tbody tr').count() > 0, `${shelf}/${sub}`);
    assert.equal(await page.locator('.shelf-rules-panel').count(), 1);
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/#shelves?${new URLSearchParams({shelf:'稳健理财',sub:'安理财'})}`);
  await page.waitForSelector('#shelfSearch');
  const count = await page.locator('.shelf-metrics').innerText();
  await page.fill('#shelfSearch','019807');
  await page.press('#shelfSearch','Enter');
  assert.equal(await page.locator('.shelf-product-table tbody tr').count(), 1);
  assert.ok((await page.locator('.shelf-product-table').innerText()).includes('019807'));
  await page.click('[data-product-code="019807"]');
  await page.waitForSelector('dialog[open]');
  assert.ok((await page.locator('#detailBody').innerText()).includes('合同持有期'));
  await page.locator('dialog [data-compare-code="019807"]').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-shelf-view="pending"]').count(), 0);
  await page.click('[data-shelf-view="exited"]');
  assert.equal(await page.locator('.shelf-metrics').innerText(), count);
  await page.click('[data-shelf-view="current"]');
  await page.fill('#shelfSearch','');
  await page.press('#shelfSearch','Enter');
  await page.click('[data-shelf-sort="established"]');
  assert.equal(await page.locator('th[aria-sort="ascending"]').count(), 1);
  await page.click('[data-shelf-sort="established"]');
  assert.equal(await page.locator('th[aria-sort="descending"]').count(), 1);
  for (const width of [1440,1200,768,390,320]) {
    await page.setViewportSize({width,height:1080});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `shelf overflow ${width}`);
    const rowCount = await page.locator('.shelf-metrics>.metric-card').evaluateAll(cards => new Set(cards.map(card => card.getBoundingClientRect().top)).size);
    assert.equal(rowCount, width < 768 ? 2 : 1);
    if ([1440,390].includes(width)) await page.screenshot({path:fileURLToPath(new URL(`shelf-detail-${width}.png`,outputDir)),fullPage:true});
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/#comparison`);
  await page.waitForSelector('.comparison-selection');
  assert.ok((await page.locator('#comparison').innerText()).includes('019807'));
  assert.deepEqual(errors, []);
  await writeFile(new URL('result.json', outputDir), JSON.stringify({ passed: true, widths: [1920,1440,1200,768,390,320], errors }));
  console.log('Browser checks passed: single-row metrics, removed copy, six modules, dialogs, navigation and no console errors.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
