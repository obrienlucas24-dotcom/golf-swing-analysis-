import { GoogleGenerativeAI } from '@google/generative-ai'

export const config = {
  api: { bodyParser: { sizeLimit: '25mb' } },
}

const rateMap = new Map()
function isRateLimited(ip) {
  const now = Date.now()
  const entry = rateMap.get(ip) || { count: 0, resetAt: now + 3_600_000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 3_600_000 }
  if (entry.count >= 10) return true
  entry.count++; rateMap.set(ip, entry); return false
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests. Limit is 10 per hour.' })

  const { videoData, mediaType } = req.body ?? {}
  if (!videoData) return res.status(400).json({ error: 'No video data provided.' })

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent([
      { inlineData: { mimeType: mediaType || 'video/mp4', data: videoData } },
      {
        text: `You are an elite PGA-certified golf coach. Analyze this golf swing and return ONLY valid JSON — no markdown, no extra text:

{
  "score": <integer 0-100>,
  "summary": "<2-3 sentence overall assessment>",
  "phases": [
    { "name": "Setup & Address", "rating": <1-10>, "feedback": "<advice>" },
    { "name": "Takeaway",        "rating": <1-10>, "feedback": "<advice>" },
    { "name": "Backswing",       "rating": <1-10>, "feedback": "<advice>" },
    { "name": "Top of Swing",    "rating": <1-10>, "feedback": "<advice>" },
    { "name": "Downswing",       "rating": <1-10>, "feedback": "<advice>" },
    { "name": "Impact Zone",     "rating": <1-10>, "feedback": "<advice>" },
    { "name": "Follow-Through",  "rating": <1-10>, "feedback": "<advice>" }
  ],
  "bodyPosition": {
    "stance": "<feedback>", "grip": "<feedback>", "posture": "<feedback>",
    "headPosition": "<feedback>", "hipRotation": "<feedback>", "shoulderTurn": "<feedback>"
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
