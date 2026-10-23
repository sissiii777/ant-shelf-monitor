import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
await mkdir(new URL('docs/assets/', root), { recursive: true });
await mkdir(new URL('docs/data/', root), { recursive: true });
for (const file of ['app.js', 'styles.css', 'model.js', 'overview.js', 'shelf-model.js', 'shelves.js', 'assets/ant-finance-logo.png', 'data/shelves.json.gz']) {
  await copyFile(new URL(`public/${file}`, root), new URL(`docs/${file}`, root));
}
const html = await readFile(new URL('public/index.html', root), 'utf8');
await writeFile(new URL('docs/index.html', root), html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-snapshot="gzip">'));
await writeFile(new URL('docs/.nojekyll', root), '');
console.log('GitHub Pages snapshot ready in docs/.');
