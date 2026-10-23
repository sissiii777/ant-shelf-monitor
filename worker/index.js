function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function extract(source, name) {
  const match = source.match(new RegExp(`\\bvar\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) throw new Error(`Missing upstream field: ${name}`);
  return JSON.parse(match[1]);
}

async function fundData(code) {
  const sourceUrl = `https://fund.eastmoney.com/pingzhongdata/${code}.js`;
  const upstream = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://fund.eastmoney.com/' },
    signal: AbortSignal.timeout(20000),
    redirect: 'manual',
    cache: 'no-store',
  });
  if (!upstream.ok) throw new Error(`Upstream HTTP ${upstream.status}`);
  const source = await upstream.text();
  if (source.length > 10000000) throw new Error('Unexpected upstream response size');
  if (extract(source, 'fS_code') !== code) throw new Error('Upstream fund code mismatch');
  const trend = extract(source, 'Data_netWorthTrend');
  if (!Array.isArray(trend) || !trend.length) throw new Error('No net asset value history returned');
  const latest = trend.at(-1);
  if (!Number.isFinite(latest.x) || !Number.isFinite(latest.y) || latest.y <= 0) {
    throw new Error('Invalid latest net asset value');
  }
  return {
    ok: true,
    execution: 'server',
    code,
    name: extract(source, 'fS_name'),
    fetchedAt: new Date().toISOString(),
    latestNavDate: new Date(latest.x + 8 * 3600000).toISOString().slice(0, 10),
    latestNav: latest.y,
    dailyReturnPercent: latest.equityReturn,
    historyRecords: trend.length,
    sourceUrl,
    source: '天天基金公开数据接口',
  };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    if (url.pathname === '/api/health') return json({ ok: true, runtime: 'worker', time: new Date().toISOString() });
    const fund = url.pathname.match(/^\/api\/funds\/(\d{6})$/);
    if (fund) {
      try {
        return json(await fundData(fund[1]));
      } catch (error) {
        return json({ ok: false, code: fund[1], error: '天天基金数据请求失败', detail: error.message, checkedAt: new Date().toISOString() }, 502);
      }
    }
    const asset = assets[url.pathname === '/index.html' ? '/' : url.pathname];
    if (!asset) return new Response('Not found', { status: 404 });
    const bytes = Uint8Array.from(atob(asset.body), character => character.charCodeAt(0));
    return new Response(request.method === 'HEAD' ? null : bytes, {
      headers: { 'Content-Type': asset.type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
    });
  },
};
