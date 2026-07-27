import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const localApiProxyPlugin = (): Plugin => ({
  name: 'local-api-proxy',
  configureServer(server) {
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
