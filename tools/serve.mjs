// Local static server for dist/ with the same single-page fallback as the
// production .htaccess. Usage: node tools/serve.mjs [port]
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/', import.meta.url).pathname
const PORT = Number(process.argv[2] || 8642)
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.txt': 'text/plain', '.json': 'application/json',
}

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(ROOT, path)
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
  } catch {
    file = join(ROOT, 'index.html')
  }
  try {
    const body = await readFile(file)
    const noStore = /(version\.txt|service-worker\.js|index\.html)$/.test(file)
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', ...(noStore ? { 'Cache-Control': 'no-store' } : {}) })
    res.end(body)
  } catch {
    res.writeHead(404).end('not found')
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`))
