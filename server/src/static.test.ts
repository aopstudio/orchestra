import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'
import { createStaticHandler } from './static'

/** 起一个临时 http 服务器托管临时 dist,返回 (server, baseUrl)。 */
function startStatic(dir: string): Promise<{ server: Server; url: string }> {
  const handler = createStaticHandler(dir)
  const server = createServer((req, res) => void handler(req, res))
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

function fetchText(url: string): Promise<{ status: number; body: string }> {
  return fetch(url).then(async (r) => ({ status: r.status, body: await r.text() }))
}

describe('static handler', () => {
  it('服务 index.html 与 assets,目录请求回退到 index', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orch-dist-'))
    writeFileSync(join(dir, 'index.html'), '<html>orchestra</html>')
    const assets = join(dir, 'assets')
    mkdirSync(assets)
    writeFileSync(join(assets, 'app.js'), 'console.log(1)')

    const { server, url } = await startStatic(dir)
    try {
      const root = await fetchText(url + '/')
      expect(root.status).toBe(200)
      expect(root.body).toContain('orchestra')

      const asset = await fetchText(url + '/assets/app.js')
      expect(asset.status).toBe(200)
      expect(asset.body).toBe('console.log(1)')

      const spa = await fetchText(url + '/some/route')
      expect(spa.status).toBe(200)
      expect(spa.body).toContain('orchestra')
    } finally {
      server.close()
    }
  })

  it('不泄露 dist 目录之外的文件;不存在的资源返回 404', async () => {
    const base = mkdtempSync(join(tmpdir(), 'orch-root-'))
    const dir = join(base, 'dist')
    mkdirSync(dir)
    writeFileSync(join(dir, 'index.html'), 'ok')
    // dist 之外的机密文件
    writeFileSync(join(base, 'secret.txt'), 'TOP-SECRET')

    const { server, url } = await startStatic(dir)
    try {
      const traversal = await fetchText(url + '/../secret.txt')
      expect(traversal.status).toBe(404)
      expect(traversal.body).not.toContain('TOP-SECRET')

      // 编码形式的穿越同样不泄露
      const encoded = await fetchText(url + '/%2e%2e/secret.txt')
      expect(encoded.status).toBe(404)
      expect(encoded.body).not.toContain('TOP-SECRET')

      const missing = await fetchText(url + '/nope.js')
      expect(missing.status).toBe(404)
    } finally {
      server.close()
    }
  })
})
