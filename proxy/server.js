// proxy/server.js
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

// optional: shared-secret so only your app can call the proxy
const APP_SECRET = process.env.APP_SECRET
app.use((req, res, next) => {
  if (APP_SECRET && req.headers['x-app-secret'] !== APP_SECRET) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
})

// rate limit (per IP), adjust as you like
app.use('/api/chat', rateLimit({ windowMs: 60_000, max: 30 }))

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = process.env.MODEL || 'mistralai/mistral-7b-instruct'

app.get('/api/health', (_, res) => res.json({ ok: true, model: MODEL }))

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, temperature = 0.7, max_tokens = 512 } = req.body || {}
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages must be a non-empty array' })
    }

    // Node 18+ has fetch built in
    const orRes = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://finaitech.net',
        'X-Title': 'Prometheus AI (Android App)'
      },
      body: JSON.stringify({
        model: MODEL,
        temperature,
        max_tokens,
        messages: [
          { role: 'system', content: 'You are Prometheus AI, the Fin AI Tech fire-bringer. Be concise, helpful, on-brand.' },
          ...messages
        ]
      })
    })

    if (!orRes.ok) {
      const text = await orRes.text()
      return res.status(orRes.status).send(text)
    }

    const data = await orRes.json()
    const reply = data?.choices?.[0]?.message?.content ?? ''
    const usage = data?.usage ?? null
    res.json({ reply, usage })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'proxy_error', detail: String(e) })
  }
})

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`Proxy listening on :${port}`))
