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
              console.error(`\x1b[31m${prefix} ${message}\x1b[0m`, details ? JSON.stringify(details) : '')
            } else if (level === 'WARN') {
              console.warn(`\x1b[33m${prefix} ${message}\x1b[0m`, details ? JSON.stringify(details) : '')
            } else if (level === 'TOOL') {
              console.log(`\x1b[35m${prefix} 🛠️ ${message}\x1b[0m`, details ? JSON.stringify(details) : '')
            } else {
              console.log(`\x1b[36m${prefix}\x1b[0m ${message}`, details ? JSON.stringify(details) : '')
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
    server.middlewares.use('/api/proxy', async (req, res) => {
      if (req.method === 'POST') {
        let bodyStr = ''
        req.on('data', (chunk) => { bodyStr += chunk })
        req.on('end', async () => {
          try {
            const { targetUrl, body, headers } = JSON.parse(bodyStr)
            const response = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(headers || {})
              },
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
})
