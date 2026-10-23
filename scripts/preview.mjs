import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../dist/server/index.js', import.meta.url), 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
createServer(async (request, response) => {
  try {
    const result = await worker.fetch(new Request(`http://127.0.0.1:4178${request.url}`));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500);
    response.end('Preview request failed');
  }
}).listen(4178, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:4178/#overview'));
