import { GoogleGenerativeAI } from '@google/generative-ai'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

// ─── In-memory rate limiter (10 requests / IP / hour) ─────────────────────────
const rateMap = new Map()
const LIMIT = 10
const WINDOW = 60 * 60 * 1000 // 1 hour

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
  // ── CORS: only allow requests from your own domain ──────────────────────────
  const origin = req.headers.origin || ''
  const allowed = process.env.ALLOWED_ORIGIN // set this in Vercel env vars
  if (allowed && origin && origin !== allowed) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  res.setHeader('Access-Control-Allow-Origin', allowed || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Rate limit ───────────────────────────────────────────────────────────────
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. You can analyze up to 10 swings per hour. Please try again later.' })
  }

  // ── Validate input ───────────────────────────────────────────────────────────
  const { videoData, mediaType } = req.body ?? {}
  if (!videoData) return res.status(400).json({ error: 'No video data provided.' })
  if (!mediaType?.startsWith('video/')) return res.status(400).json({ error: 'Invalid file type. Please upload a video.' })
  // base64 is ~33% larger — 67MB base64 ≈ 50MB video
  if (videoData.length > 67 * 1024 * 1024) {
    return res.status(400).json({ error: 'Video is too large. Please use a video under 50 MB.' })
  }

  // ── Gemini analysis ──────────────────────────────────────────────────────────
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const result = await model.generateContent([
      {
        inlineData: { mimeType: mediaType, data: videoData },
      },
      {
        text: `You are an elite PGA-certified golf coach with 20+ years analyzing professional and amateur swings. You have deep expertise in biomechanics, club dynamics, and shot-shaping. Provide precise, encouraging, and immediately actionable feedback.

Analyze this golf swing video and return ONLY valid JSON — no markdown, no extra text:

{
  "score": <integer 0-100, overall swing quality>,
  "summary": "<2-3 sentence overall coach assessment>",
  "phases": [
    { "name": "Setup & Address", "rating": <1-10>, "feedback": "<specific observation + advice>" },
    { "name": "Takeaway",        "rating": <1-10>, "feedback": "<specific observation + advice>" },
    { "name": "Backswing",       "rating": <1-10>, "feedback": "<specific observation + advice>" },
    { "name": "Top of Swing",    "rating": <1-10>, "feedback": "<specific observation + advice>" },
    { "name": "Downswing",       "rating": <1-10>, "feedback": "<specific observation + advice>" },
    { "name": "Impact Zone",     "rating": <1-10>, "feedback": "<specific observation + advice>" },
    { "name": "Follow-Through",  "rating": <1-10>, "feedback": "<specific observation + advice>" }
  ],
  "bodyPosition": {
    "stance":       "<foot position, width, and alignment feedback>",
    "grip":         "<grip type, pressure, and hand position feedback>",
    "posture":      "<spine angle, tilt, and athletic posture feedback>",
    "headPosition": "<head stability and eye position through impact>",
    "hipRotation":  "<hip turn, clearance, and sequencing feedback>",
    "shoulderTurn": "<shoulder rotation, tilt, and coil feedback>"
  },
  "tips": [
    "<specific, immediately actionable tip 1>",
    "<specific, immediately actionable tip 2>",
    "<specific, immediately actionable tip 3>"
  ]
}`,
      },
    ])

    const text = result.response.text().trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Unexpected response format from AI')

    const analysis = JSON.parse(match[0])
    return res.status(200).json(analysis)
  } catch (err) {
    console.error('Gemini error:', err)
    return res.status(500).json({ error: err.message || 'Analysis failed. Please try again.' })
  }
}
