import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = [
  ['/', 'public/index.html', 'text/html; charset=utf-8'],
  ['/styles.css', 'public/styles.css', 'text/css; charset=utf-8'],
  ['/app.js', 'public/app.js', 'text/javascript; charset=utf-8'],
  ['/assets/ant-finance-logo.png', 'public/assets/ant-finance-logo.png', 'image/png'],
];
const assets = {};
for (const [path, file, type] of files) {
  assets[path] = { body: (await readFile(new URL(file, root))).toString('base64'), type };
}
const worker = await readFile(new URL('worker/index.js', root), 'utf8');
await mkdir(new URL('dist/server/', root), { recursive: true });
await mkdir(new URL('dist/.openai/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), `const assets = ${JSON.stringify(assets)};\n${worker}`);
await writeFile(new URL('dist/.openai/hosting.json', root), await readFile(new URL('.openai/hosting.json', root)));
console.log('Built Worker with embedded UI assets.');
