import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = 80

// Прокси к Supabase — обход блокировок в России
app.use('/supabase', createProxyMiddleware({
  target: 'https://dmvqiuminxrtcaylfcwg.supabase.co',
  changeOrigin: true,
  secure: true,
  pathRewrite: { '^/supabase': '' },
  on: {
    error: (err, req, res) => {
      console.error('Proxy error:', err.message)
      res.status(502).json({ error: 'Proxy error' })
    }
  }
}))

// Статика React
app.use(express.static(join(__dirname, 'dist')))

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
