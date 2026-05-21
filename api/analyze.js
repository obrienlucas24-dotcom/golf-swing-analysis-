import { GoogleGenerativeAI } from '@google/generative-ai'

// ─── Rate limiter (10 req / IP / hour) ───────────────────────────────────────
const rateMap = new Map()
const LIMIT = 10
const WINDOW = 60 * 60 * 1000

function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateMap.get(ip) || { count: 0, resetAt: now + WINDOW }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + WINDOW }
  if (entry.count >= LIMIT) return true
  entry.count++
  rateMap.set(ip, entry)
  return false
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export default async function handler(req, res) {
  const origin = req.headers.origin || ''
  const allowed = process.env.ALLOWED_ORIGIN
  if (allowed && origin && origin !== allowed) return res.status(403).json({ error: 'Forbidden' })

  res.setHeader('Access-Control-Allow-Origin', allowed || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Limit is 10 analyses per hour.' })

  const { fileUri, mediaType } = req.body ?? {}
  if (!fileUri) return res.status(400).json({ error: 'No file URI provided.' })

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent([
      { fileData: { mimeType: mediaType || 'video/mp4', fileUri } },
      {
        text: `You are an elite PGA-certified golf coach with 20+ years analyzing professional and amateur swings. Provide precise, encouraging, and immediately actionable feedback. Return ONLY valid JSON — no markdown, no extra text:

{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "phases": [
    { "name": "Setup & Address", "rating": <1-10>, "feedback": "<observation + advice>" },
    { "name": "Takeaway",        "rating": <1-10>, "feedback": "<observation + advice>" },
    { "name": "Backswing",       "rating": <1-10>, "feedback": "<observation + advice>" },
    { "name": "Top of Swing",    "rating": <1-10>, "feedback": "<observation + advice>" },
    { "name": "Downswing",       "rating": <1-10>, "feedback": "<observation + advice>" },
    { "name": "Impact Zone",     "rating": <1-10>, "feedback": "<observation + advice>" },
    { "name": "Follow-Through",  "rating": <1-10>, "feedback": "<observation + advice>" }
  ],
  "bodyPosition": {
    "stance":       "<foot position, width, alignment>",
    "grip":         "<grip type, pressure, hand position>",
    "posture":      "<spine angle, tilt, athletic posture>",
    "headPosition": "<head stability, eye position>",
    "hipRotation":  "<hip turn, clearance, sequencing>",
    "shoulderTurn": "<shoulder rotation, tilt, coil>"
  },
  "tips": ["<tip 1>", "<tip 2>", "<tip 3>"]
}`,
      },
    ])

    const text = result.response.text().trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Unexpected AI response format')

    return res.status(200).json(JSON.parse(match[0]))
  } catch (err) {
    console.error('Gemini error:', err)
    return res.status(500).json({ error: err.message || 'Analysis failed. Please try again.' })
  }
}
