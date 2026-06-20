import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 80

const supabaseProxy = createProxyMiddleware({
  target: 'https://dmvqiuminxrtcaylfcwg.supabase.co',
  changeOrigin: true,
  secure: true,
  ws: true,
  pathRewrite: { '^/supabase': '' },
  on: {
    error: (err, req, res) => {
      console.error('Proxy error:', err.message)
      if (res.writeHead) {
        res.status(502).json({ error: 'Proxy error', message: err.message })
      }
    },
    proxyReq: (proxyReq) => {
      proxyReq.removeHeader('origin')
    }
  }
})

// Прокси к Supabase
app.use('/supabase', supabaseProxy)

// Статика React
app.use(express.static(join(__dirname, 'dist')))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

// WebSocket upgrade для realtime
server.on('upgrade', supabaseProxy.upgrade)
