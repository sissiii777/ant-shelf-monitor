import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = new URL('../docs/', import.meta.url);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  if (!path.startsWith('/ant-shelf-monitor/')) { response.writeHead(404); response.end(); return; }
  const file = path.slice('/ant-shelf-monitor/'.length) || 'index.html';
  try {
    const bytes = await readFile(new URL(file, root));
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    response.end(bytes);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/ant-shelf-monitor/#overview`);
  await page.waitForSelector('.metric-card');
  assert.ok((await page.locator('.metric-card').first().innerText()).includes('208'));
  await page.click('a[data-page="shelves"]');
  await page.waitForSelector('.shelf-product-table');
  assert.equal(await page.locator('.shelf-metrics>.metric-card').count(), 4);
  assert.deepEqual(errors, []);
  console.log('Pages snapshot passed: compressed data, repository subpath, navigation and shelf table.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
