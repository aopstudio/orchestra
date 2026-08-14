/**
 * 静态托管(生产部署): 把 client/dist 构建产物与 WebSocket 端点放在同一个
 * http(s) 端口上,一个 Node 进程即可完成「前端页面 + 实时合奏」的部署。
 *
 * - 只允许访问 dist 目录内的文件(路径规范化防穿越)
 * - 目录请求回 index.html;未知路径且带扩展名 → 404;不带扩展名 → SPA 回退
 * - dist 不存在时(纯开发环境)返回提示,不影响 ws 服务
 */

import { readFile } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url))

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
}

function send(res: ServerResponse, status: number, body: string, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, { 'Content-Type': type })
  res.end(body)
}

function sendFile(res: ServerResponse, file: string): void {
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type })
  createReadStream(file).pipe(res)
}

/**
 * 静态托管处理器工厂(测试可注入任意 dist 目录)。
 */
export function createStaticHandler(distDir: string) {
  return async function handleStatic(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const pathname = decodeURIComponent(url.pathname)

    // 只服务 GET/HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(res, 405, 'method not allowed')
      return
    }

    // 路径规范化: 拒绝任何包含 .. 的请求
    const rel = normalize(pathname).replace(/^([/\\])+/, '')
    if (rel.split(sep).includes('..')) {
      send(res, 403, 'forbidden')
      return
    }

    let file = join(distDir, rel === '' ? 'index.html' : rel)
    try {
      const stat = await import('node:fs/promises').then((m) => m.stat(file))
      if (stat.isDirectory()) file = join(file, 'index.html')
      sendFile(res, file)
      return
    } catch {
      // 不存在: SPA 回退(无扩展名的路由路径),否则 404
      if (extname(rel) === '') {
        try {
          await readFile(join(distDir, 'index.html'))
          sendFile(res, join(distDir, 'index.html'))
          return
        } catch {
          send(res, 404, 'no build found — run `npm run build -w client` first')
          return
        }
      }
      send(res, 404, 'not found')
    }
  }
}

/** 默认实例: 指向 client/dist。 */
export const handleStatic = createStaticHandler(DEFAULT_DIST)
