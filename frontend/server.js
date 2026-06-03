import express from 'express'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json({ limit: '60mb' }))

// Serve React build
app.use(express.static(join(__dirname, 'dist')))

// ── Anthropic proxy ──────────────────────────────────────────────────────────
// Keeps API key server-side; frontend sends { messages, system, maxTokens }
app.post('/api/claude', async (req, res) => {
  const { messages, system, maxTokens } = req.body
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' })
  }
  try {
    const { default: fetch } = await import('node-fetch')
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens || 8000,
        system: system || undefined,
        messages
      })
    })
    const data = await upstream.json()
    if (data.error) return res.status(400).json({ error: data.error.message })
    const text = (data.content || []).map(b => b.text || '').join('')
    res.json({ text })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── SPA fallback ─────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Generator server running on port ${PORT}`)
})
