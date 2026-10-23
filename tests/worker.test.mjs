import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('UI assets and navigation remain available', async () => {
  const response = await worker.fetch(new Request('https://test/'));
  const html = await response.text();
  assert.equal(response.status, 200);
  for (const title of ['总览', '货架', '公司', '对标分析']) assert.ok(html.includes(title));
  const logo = await worker.fetch(new Request('https://test/assets/ant-finance-logo.png'));
  assert.equal(logo.headers.get('content-type'), 'image/png');
});

test('server fetches and validates a fund response', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.equal(url, 'https://fund.eastmoney.com/pingzhongdata/012229.js');
      return new Response('var fS_code="012229";var fS_name="测试基金";var Data_netWorthTrend=[{"x":1792598400000,"y":1.1542,"equityReturn":0.01}];');
    };
    const response = await worker.fetch(new Request('https://test/api/funds/012229'));
    const body = await response.json();
    assert.equal(body.execution, 'server');
    assert.equal(body.latestNavDate, '2026-10-22');
    assert.equal(body.latestNav, 1.1542);
    globalThis.fetch = async () => new Response('<html>blocked</html>');
    assert.equal((await worker.fetch(new Request('https://test/api/funds/012229'))).status, 502);
  } finally {
    globalThis.fetch = original;
  }
});

test('invalid codes cannot request arbitrary upstream URLs', async () => {
  assert.equal((await worker.fetch(new Request('https://test/api/funds/invalid'))).status, 404);
});
