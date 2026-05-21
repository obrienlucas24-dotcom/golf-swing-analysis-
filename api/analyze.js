import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { videoData, mediaType } = req.body ?? {}

  if (!videoData) return res.status(400).json({ error: 'No video data provided' })

  const validTypes = ['video/mp4', 'video/mov', 'video/quicktime', 'video/webm', 'video/avi', 'video/x-msvideo']
  if (mediaType && !validTypes.some((t) => mediaType.startsWith('video/'))) {
    return res.status(400).json({ error: 'Invalid media type. Please upload a video file.' })
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are an elite PGA-certified golf coach with 20+ years of experience analyzing professional and amateur swings. You have deep expertise in biomechanics, club dynamics, and shot-shaping. You provide precise, encouraging, and immediately actionable feedback. Always respond with valid JSON only — no markdown fences, no preamble, no text outside the JSON object.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'video',
              source: {
                type: 'base64',
                media_type: mediaType || 'video/mp4',
                data: videoData,
              },
            },
            {
              type: 'text',
              text: `Analyze this golf swing video as a PGA coach. Return ONLY the following JSON — no extra text:

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
    "stance":        "<foot position, width, and alignment feedback>",
    "grip":          "<grip type, pressure, and hand position feedback>",
    "posture":       "<spine angle, tilt, and athletic posture feedback>",
    "headPosition":  "<head stability and eye position through impact>",
    "hipRotation":   "<hip turn, clearance, and sequencing feedback>",
    "shoulderTurn":  "<shoulder rotation, tilt, and coil feedback>"
  },
  "tips": [
    "<specific, immediately actionable tip 1>",
    "<specific, immediately actionable tip 2>",
    "<specific, immediately actionable tip 3>"
  ]
}`,
            },
          ],
        },
      ],
    })

    const raw = response.content[0].text.trim()
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Unexpected response format from AI')

    const analysis = JSON.parse(match[0])
    return res.status(200).json(analysis)
  } catch (err) {
    console.error('Claude API error:', err)
    return res.status(500).json({ error: err.message || 'Analysis failed. Please try again.' })
  }
}
