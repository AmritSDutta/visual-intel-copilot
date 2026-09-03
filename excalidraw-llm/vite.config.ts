import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const localApiProxyPlugin = (): Plugin => ({
  name: 'local-api-proxy',
  configureServer(server) {
    // 1. Standard Logger Endpoint -> pipes browser logs to Terminal Stdout
    server.middlewares.use('/api/log', async (req, res) => {
      if (req.method === 'POST') {
        let bodyStr = ''
        req.on('data', (chunk) => { bodyStr += chunk })
        req.on('end', () => {
          try {
            const { level, tag, message, details } = JSON.parse(bodyStr)
            const time = new Date().toTimeString().split(' ')[0]
            const prefix = `[${time}] [${level || 'INFO'}] [${tag || 'APP'}]`
            
            if (level === 'ERROR') {
              console.error(`\x1b[31m${prefix} ${message}\x1b[0m`, details !== undefined ? details : '')
            } else if (level === 'WARN') {
              console.warn(`\x1b[33m${prefix} ${message}\x1b[0m`, details !== undefined ? details : '')
            } else if (level === 'TOOL') {
              console.log(`\x1b[35m${prefix} 🛠️ ${message}\x1b[0m`, details !== undefined ? details : '')
            } else if (level === 'DEBUG') {
              console.log(`\x1b[90m${prefix} ${message}\x1b[0m`, details !== undefined ? details : '')
            } else {
              console.log(`\x1b[36m${prefix}\x1b[0m ${message}`, details !== undefined ? details : '')
            }
          } catch {}
          res.statusCode = 204
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end()
        })
      } else {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end()
      }
    })

    // 2. Local API Proxy for external AI providers
    // Mirrors functions/api/proxy.ts: allow-list only (no open relay), Authorization-only header forwarding.
    server.middlewares.use('/api/proxy', async (req, res) => {
      if (req.method === 'POST') {
        let bodyStr = ''
        req.on('data', (chunk) => { bodyStr += chunk })
        req.on('end', async () => {
          try {
            const { targetUrl, body, headers } = JSON.parse(bodyStr)
            let parsed: URL
            try {
              parsed = new URL(targetUrl)
            } catch {
              parsed = null as unknown as URL
            }
            const allowed = !!parsed && parsed.protocol === 'https:' && ['ollama.com', 'generativelanguage.googleapis.com'].includes(parsed.hostname.toLowerCase())
            if (!allowed) {
              res.statusCode = 403
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.end(JSON.stringify({ error: 'Blocked: target host is not on the proxy allow-list (allowed: ollama.com, generativelanguage.googleapis.com)' }))
              return
            }
            const forwardHeaders: Record<string, string> = {
              'Content-Type': 'application/json'
            }
            if (headers && typeof headers.Authorization === 'string' && headers.Authorization) {
              forwardHeaders['Authorization'] = headers.Authorization
            }
            const response = await fetch(targetUrl, {
              method: 'POST',
              headers: forwardHeaders,
              body: JSON.stringify(body)
            })
            const data = await response.text()
            res.statusCode = response.status
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(data)
          } catch (e: any) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: e?.message || 'Local proxy failed' }))
          }
        })
      } else {
        res.statusCode = 204
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end()
      }
    })
  }
})

export default defineConfig({
  plugins: [react(), localApiProxyPlugin()],
  server: {
    headers: {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    }
  },
  preview: {
    headers: {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    }
  }
})
