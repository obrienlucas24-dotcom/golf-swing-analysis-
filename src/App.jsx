import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  green:      '#1a3a2a',
  greenLight: '#2d5a3d',
  greenMid:   '#234d35',
  cream:      '#f5f0e8',
  creamDark:  '#ede8df',
  gold:       '#c9a84c',
  goldLight:  '#d4b96a',
  text:       '#1a1a1a',
  muted:      '#6b7280',
  error:      '#dc2626',
  errorBg:    '#fef2f2',
  errorBorder:'#fecaca',
  white:      '#ffffff',
}

const MAX_SIZE = 200 * 1024 * 1024 // 200MB — Gemini File API supports up to 2GB

// ─── Tips data ────────────────────────────────────────────────────────────────
const TIPS_DATA = [
  {
    category: 'Stance',
    icon: '🦵',
    tips: [
      { title: 'Shoulder-Width Foundation', body: 'Position feet shoulder-width apart for irons, slightly wider for driver. This creates the stable base needed for consistent ball striking through impact.' },
      { title: 'Parallel Alignment', body: 'Align feet, hips, and shoulders parallel to your target line. Think railroad tracks — ball on one rail, your body on the other. Even tour pros check this daily.' },
      { title: 'Athletic Knee Flex', body: 'Soften your knees as if sitting back onto a bar stool. Too straight or too bent both rob you of power and stability through the swing arc.' },
      { title: 'Ball Position by Club', body: 'Play the ball forward off the left heel for driver, work it progressively back toward center as clubs get shorter. 7-iron sits just ahead of center.' },
    ],
  },
  {
    category: 'Grip',
    icon: '✋',
    tips: [
      { title: 'The Handshake Principle', body: 'Hold the club like a firm handshake — controlled but not crushing. Excess grip pressure is the #1 killer of club head speed for amateurs.' },
      { title: "Neutral V's", body: "Both thumbs and forefingers form V's pointing toward your right shoulder (right-handed). This neutral grip gives you the best chance of a square face at impact." },
      { title: 'Finger Pressure', body: 'Feel the grip primarily in your fingers, not your palm. The last three fingers of your lead hand are your anchor and control point throughout the swing.' },
      { title: 'Consistent Pressure', body: 'Maintain the same light-to-medium grip pressure from address through follow-through. Many amateurs tighten at the top — this kills lag and speed.' },
    ],
  },
  {
    category: 'Swing Path',
    icon: '🏌️',
    tips: [
      { title: 'Inside-Out Attack', body: 'Swing on an inside-out path through impact to eliminate the slice. Imagine swinging toward right field (right-handers) — this promotes the draw spin that adds distance.' },
      { title: 'Full Shoulder Turn', body: 'Rotate your lead shoulder under your chin on the backswing — a full 90° turn is the goal. This creates maximum coil and potential energy to release through the ball.' },
      { title: 'Hip-Led Downswing', body: 'Initiate the downswing with your hips firing toward the target. Let the arms follow naturally — the sequence is hips, shoulders, arms, club. Never lead with your hands.' },
      { title: 'Maintain Lag', body: 'Keep the angle between your arms and club shaft as long as possible on the downswing. Release that angle through the impact zone — not before — for maximum speed.' },
    ],
  },
  {
    category: 'Mental Game',
    icon: '🧠',
    tips: [
      { title: 'Pre-Shot Routine', body: "Develop and commit to a consistent pre-shot routine for every single shot. It anchors focus and signals your brain that it's time to execute, not think." },
      { title: 'Target, Not Mechanics', body: 'Once you step into address, focus only on your target. Mechanics belong on the practice range. On the course, trust your training and see the shot.' },
      { title: 'Embrace Imperfection', body: 'Tour pros hit bad shots every round. Your emotional response to bad shots defines your score more than the shots themselves. Reset and move on.' },
      { title: 'Breathe & Release', body: 'Take one full, deep breath before each shot. This lowers heart rate, relaxes grip tension, and clears mental noise. It takes 4 seconds and costs nothing.' },
    ],
  },
]

// ─── Utilities ────────────────────────────────────────────────────────────────
const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const scoreLabel = (s) => {
  if (s >= 90) return 'Elite'
  if (s >= 75) return 'Advanced'
  if (s >= 60) return 'Intermediate'
  if (s >= 45) return 'Developing'
  return 'Beginner'
}

const ratingColor = (r) => {
  if (r >= 8) return C.gold
  if (r >= 6) return '#22c55e'
  if (r >= 4) return '#f59e0b'
  return C.error
}

// Upload video directly to Gemini File API from the browser
async function uploadToGemini(file, apiKey, onProgress) {
  const CHUNK = 8 * 1024 * 1024 // 8MB chunks
  const total = file.size

  // Initiate resumable upload
  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': total,
        'X-Goog-Upload-Header-Content-Type': file.type,
      },
      body: JSON.stringify({ file: { display_name: file.name } }),
    }
  )
  if (!initRes.ok) throw new Error('Failed to initiate upload')
  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) throw new Error('No upload URL returned')

  // Upload in chunks
  let offset = 0
  let fileUri = null
  while (offset < total) {
    const chunk = file.slice(offset, offset + CHUNK)
    const isLast = offset + chunk.size >= total
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': chunk.size,
        'X-Goog-Upload-Offset': offset,
        'X-Goog-Upload-Command': isLast ? 'upload, finalize' : 'upload',
      },
      body: chunk,
    })
    if (!uploadRes.ok) throw new Error('Chunk upload failed')
    offset += chunk.size
    if (onProgress) onProgress(Math.round((offset / total) * 100))
    if (isLast) {
      const data = await uploadRes.json()
      fileUri = data?.file?.uri
    }
  }
  if (!fileUri) throw new Error('Upload complete but no file URI returned')
  return fileUri
}

// ─── ScoreRing ────────────────────────────────────────────────────────────────
function ScoreRing({ score, animate = false, size = 148 }) {
  const [displayed, setDisplayed] = useState(animate ? 0 : score)
  const radius = 54
  const circ = 2 * Math.PI * radius
  const offset = circ - (displayed / 100) * circ

  useEffect(() => {
    if (!animate) { setDisplayed(score); return }
    let start = null
    const duration = 1100
    const step = (ts) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayed(Math.round(eased * score))
      if (p < 1) requestAnimationFrame(step)
    }
    const id = requestAnimationFrame(step)
    return () => cancelAnimationFrame(id)
  }, [score, animate])

  return (
    <svg width={size} height={size} viewBox="0 0 132 132">
      <circle cx="66" cy="66" r={radius} fill="none" stroke={C.greenLight} strokeWidth="10" />
      <circle
        cx="66" cy="66" r={radius}
        fill="none" stroke={C.gold} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        transform="rotate(-90 66 66)"
        style={{ transition: animate ? 'none' : 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="66" y="60" textAnchor="middle" fill={C.gold} fontSize="30" fontWeight="800" fontFamily="-apple-system,sans-serif">{displayed}</text>
      <text x="66" y="76" textAnchor="middle" fill={C.cream} fontSize="11" fontFamily="-apple-system,sans-serif" opacity="0.85">{scoreLabel(displayed)}</text>
      <text x="66" y="91" textAnchor="middle" fill={C.cream} fontSize="10" fontFamily="-apple-system,sans-serif" opacity="0.45">out of 100</text>
    </svg>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard({ lines = 3 }) {
  return (
    <div style={{ background: C.white, borderRadius: 16, overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
      <div style={{ background: C.greenLight, height: 46, padding: '14px 18px', display: 'flex', alignItems: 'center' }}>
        <div className="skeleton-line" style={{ width: '38%', height: 16, borderRadius: 6, background: 'rgba(255,255,255,0.18)' }} />
      </div>
      <div style={{ padding: '18px 18px 14px' }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="skeleton-line" style={{ width: i === lines - 1 ? '55%' : '100%', height: 13, borderRadius: 4, marginBottom: 10, background: C.creamDark }} />
        ))}
      </div>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function Card({ title, icon, children }) {
  return (
    <div style={{ background: C.white, borderRadius: 18, overflow: 'hidden', marginBottom: 14, boxShadow: '0 2px 14px rgba(0,0,0,0.06)' }}>
      <div style={{ background: C.green, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
        <span style={{ color: C.cream, fontWeight: 700, fontSize: 14, letterSpacing: '0.01em' }}>{title}</span>
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </div>
  )
}

function PhaseRow({ phase }) {
  const color = ratingColor(phase.rating)
  return (
    <div style={{ marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${C.creamDark}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{phase.name}</span>
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{phase.rating}/10</span>
      </div>
      <div style={{ height: 4, background: C.creamDark, borderRadius: 2, marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${phase.rating * 10}%`, background: color, borderRadius: 2, transition: 'width 1s ease' }} />
      </div>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.55, margin: 0 }}>{phase.feedback}</p>
    </div>
  )
}

function BodyItem({ label, value }) {
  return (
    <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.creamDark}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.gold, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.55 }}>{value}</p>
    </div>
  )
}

function TipItem({ tip, index }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${C.creamDark}` }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.gold, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: C.green }}>
        {index + 1}
      </div>
      <p style={{ fontSize: 13, color: C.text, margin: 0, lineHeight: 1.6 }}>{tip}</p>
    </div>
  )
}

function ErrorBanner({ msg, onRetry }) {
  return (
    <div style={{ background: C.errorBg, border: `1px solid ${C.errorBorder}`, borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.error, lineHeight: 1.5 }}>{msg}</p>
        {onRetry && (
          <button onClick={onRetry} style={{ marginTop: 10, padding: '8px 18px', borderRadius: 50, background: C.error, color: C.white, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            Try Again
          </button>
        )}
      </div>
    </div>
  )
}

// ─── AnalyzeScreen ────────────────────────────────────────────────────────────
function AnalyzeScreen({ history, setHistory }) {
  const [phase, setPhase] = useState('upload')
  const [videoFile, setVideoFile] = useState(null)
  const [videoUrl, setVideoUrl] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [loadingMsg, setLoadingMsg] = useState('Uploading video…')
  const fileRef = useRef(null)

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      setError('Please upload a valid video file (MP4, MOV, etc.)')
      setPhase('error'); return
    }
    if (file.size > MAX_SIZE) {
      setError(`Video must be under 200 MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`)
      setPhase('error'); return
    }
    setError('')
    setVideoFile(file)
    setVideoUrl(URL.createObjectURL(file))
    setPhase('preview')
  }, [])

  const handleAnalyze = useCallback(async () => {
    if (!videoFile) return
    setPhase('loading')
    setUploadProgress(0)
    setLoadingMsg('Uploading video to AI…')
    setError('')

    try {
      // Step 1: upload video directly to Gemini File API
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) throw new Error('Gemini API key not configured (VITE_GEMINI_API_KEY)')

      const fileUri = await uploadToGemini(videoFile, apiKey, (pct) => {
        setUploadProgress(pct)
        setLoadingMsg(`Uploading… ${pct}%`)
      })

      // Step 2: send just the URI to our serverless function
      setLoadingMsg('Analyzing your swing…')
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileUri, mediaType: videoFile.type }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }
      const data = await res.json()
      setAnalysis(data)
      setPhase('results')
      setHistory((prev) => [{
        id: Date.now(), timestamp: Date.now(),
        score: data.score, summary: data.summary || '', analysis: data,
      }, ...prev].slice(0, 20))
    } catch (e) {
      setError(e.message || 'Analysis failed. Please try again.')
      setPhase('error')
    }
  }, [videoFile, setHistory])

  const reset = useCallback(() => {
    setPhase('upload')
    setVideoFile(null)
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(null)
    setAnalysis(null)
    setError('')
    setUploadProgress(0)
  }, [videoUrl])

  return (
    <div>
      <div style={{ background: C.green, padding: '54px 24px 30px', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 6 }}>⛳</div>
        <h1 style={{ color: C.gold, fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>SwingAI</h1>
        <p style={{ color: C.cream, fontSize: 13, margin: '6px 0 0', opacity: 0.75 }}>Your personal PGA swing coach</p>
      </div>

      <div style={{ padding: '20px 16px 24px' }}>

        {(phase === 'upload' || phase === 'error') && (
          <div className="fade-in-fast">
            {error && <ErrorBanner msg={error} onRetry={reset} />}
            <input ref={fileRef} type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{ width: '100%', minHeight: 190, background: C.white, border: `2px dashed ${C.greenLight}`, borderRadius: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, cursor: 'pointer', marginBottom: 24 }}
            >
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🎥</div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 17, color: C.green }}>Upload Your Swing</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>Up to 200 MB · MP4, MOV, any format</p>
              </div>
              <div style={{ background: C.green, color: C.cream, padding: '13px 32px', borderRadius: 50, fontSize: 14, fontWeight: 700 }}>Choose Video</div>
            </button>

            {history.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>Recent Swings</p>
                <div className="scroll-hide" style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                  {history.slice(0, 8).map((h) => (
                    <div key={h.id} style={{ flexShrink: 0, width: 78, borderRadius: 14, overflow: 'hidden', background: C.white, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                      <div style={{ height: 58, background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⛳</div>
                      <div style={{ padding: '6px 4px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: C.gold }}>{h.score}</div>
                        <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{fmtDate(h.timestamp)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'preview' && videoUrl && (
          <div className="fade-in-fast">
            <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 18, maxHeight: 300, background: '#000', marginBottom: 16, objectFit: 'contain', display: 'block' }} />
            <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', margin: '0 0 16px' }}>
              {videoFile?.name} · {(videoFile?.size / 1024 / 1024).toFixed(1)} MB
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={reset} style={{ flex: 1, padding: '15px 0', borderRadius: 50, border: `2px solid ${C.green}`, background: 'transparent', color: C.green, fontWeight: 600, fontSize: 15, cursor: 'pointer', minHeight: 52 }}>Change</button>
              <button onClick={handleAnalyze} style={{ flex: 2.2, padding: '15px 0', borderRadius: 50, background: C.green, color: C.cream, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', minHeight: 52 }}>Analyze Swing ⛳</button>
            </div>
          </div>
        )}

        {phase === 'loading' && (
          <div>
            {videoUrl && <video src={videoUrl} playsInline muted style={{ width: '100%', borderRadius: 18, maxHeight: 220, background: '#000', marginBottom: 18, objectFit: 'contain', display: 'block' }} />}
            <div style={{ textAlign: 'center', padding: '18px 0 10px' }}>
              <div className="pulse-spin" style={{ width: 46, height: 46, border: `4px solid ${C.creamDark}`, borderTopColor: C.gold, borderRadius: '50%', margin: '0 auto 14px' }} />
              <p style={{ fontWeight: 700, fontSize: 17, color: C.green, margin: 0 }}>{loadingMsg}</p>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div style={{ margin: '14px auto 0', maxWidth: 220 }}>
                  <div style={{ height: 4, background: C.creamDark, borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${uploadProgress}%`, background: C.gold, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}
              {uploadProgress === 100 && <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Your PGA coach is reviewing every frame…</p>}
            </div>
            <div style={{ marginTop: 20 }}>
              <SkeletonCard lines={2} />
              <SkeletonCard lines={5} />
              <SkeletonCard lines={3} />
            </div>
          </div>
        )}

        {phase === 'results' && analysis && (
          <div className="fade-in">
            {videoUrl && <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 18, maxHeight: 220, background: '#000', marginBottom: 16, objectFit: 'contain', display: 'block' }} />}

            <div style={{ background: C.green, borderRadius: 22, padding: '28px 24px 24px', marginBottom: 14, textAlign: 'center', boxShadow: '0 6px 24px rgba(26,58,42,0.28)' }}>
              <p style={{ color: C.cream, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 18px', opacity: 0.65 }}>Overall Swing Score</p>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><ScoreRing score={analysis.score} animate /></div>
              {analysis.summary && <p style={{ color: C.cream, fontSize: 13, lineHeight: 1.65, margin: 0, opacity: 0.88 }}>{analysis.summary}</p>}
            </div>

            {analysis.phases?.length > 0 && (
              <Card title="Phase Breakdown" icon="📊">
                {analysis.phases.map((p, i) => <PhaseRow key={i} phase={p} />)}
              </Card>
            )}
            {analysis.bodyPosition && Object.keys(analysis.bodyPosition).length > 0 && (
              <Card title="Body Position Analysis" icon="🏌️">
                {Object.entries(analysis.bodyPosition).map(([k, v]) => <BodyItem key={k} label={k.replace(/([A-Z])/g, ' $1').trim()} value={v} />)}
              </Card>
            )}
            {analysis.tips?.length > 0 && (
              <Card title="Coach's Top Tips" icon="💡">
                {analysis.tips.map((t, i) => <TipItem key={i} tip={t} index={i} />)}
              </Card>
            )}
            <button onClick={reset} style={{ width: '100%', padding: '15px 0', borderRadius: 50, background: C.green, color: C.cream, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', marginTop: 8, minHeight: 52 }}>
              Analyze Another Swing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── HistoryScreen ────────────────────────────────────────────────────────────
function HistoryScreen({ history, setHistory }) {
  const [selected, setSelected] = useState(null)

  if (selected) {
    return (
      <div>
        <div style={{ background: C.green, padding: '54px 20px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.cream, fontSize: 22, cursor: 'pointer', padding: '8px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
          <div>
            <h2 style={{ color: C.gold, fontSize: 20, fontWeight: 800, margin: 0 }}>Swing Details</h2>
            <p style={{ color: C.cream, fontSize: 12, margin: '2px 0 0', opacity: 0.65 }}>{fmtDate(selected.timestamp)}</p>
          </div>
        </div>
        <div style={{ padding: '20px 16px 24px' }} className="fade-in">
          <div style={{ background: C.green, borderRadius: 22, padding: '26px 24px', marginBottom: 14, textAlign: 'center', boxShadow: '0 4px 20px rgba(26,58,42,0.22)' }}>
            <p style={{ color: C.cream, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', margin: '0 0 16px', opacity: 0.65 }}>Overall Score</p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: selected.summary ? 16 : 0 }}><ScoreRing score={selected.score} /></div>
            {selected.summary && <p style={{ color: C.cream, fontSize: 13, lineHeight: 1.6, margin: 0, opacity: 0.88 }}>{selected.summary}</p>}
          </div>
          {selected.analysis?.phases?.length > 0 && <Card title="Phase Breakdown" icon="📊">{selected.analysis.phases.map((p, i) => <PhaseRow key={i} phase={p} />)}</Card>}
          {selected.analysis?.bodyPosition && <Card title="Body Position" icon="🏌️">{Object.entries(selected.analysis.bodyPosition).map(([k, v]) => <BodyItem key={k} label={k.replace(/([A-Z])/g, ' $1').trim()} value={v} />)}</Card>}
          {selected.analysis?.tips?.length > 0 && <Card title="Coach's Tips" icon="💡">{selected.analysis.tips.map((t, i) => <TipItem key={i} tip={t} index={i} />)}</Card>}
          <button onClick={() => { if (window.confirm('Delete this swing?')) { setHistory((p) => p.filter((h) => h.id !== selected.id)); setSelected(null) } }} style={{ width: '100%', padding: '14px 0', borderRadius: 50, border: `2px solid ${C.errorBorder}`, background: 'transparent', color: C.error, fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
            Delete This Swing
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ background: C.green, padding: '54px 24px 28px' }}>
        <h2 style={{ color: C.gold, fontSize: 22, fontWeight: 800, margin: 0 }}>Swing History</h2>
        <p style={{ color: C.cream, fontSize: 13, margin: '4px 0 0', opacity: 0.7 }}>{history.length} session{history.length !== 1 ? 's' : ''} recorded</p>
      </div>
      <div style={{ padding: '16px' }}>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 24px' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🏌️</div>
            <p style={{ fontWeight: 700, fontSize: 18, color: C.green, margin: 0 }}>No swings yet</p>
            <p style={{ fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>Upload your first swing to start tracking your progress</p>
          </div>
        ) : history.map((h) => (
          <button key={h.id} onClick={() => setSelected(h)} style={{ width: '100%', background: C.white, border: 'none', borderRadius: 18, padding: '16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, cursor: 'pointer', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', textAlign: 'left', minHeight: 80 }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>⛳</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>Golf Swing</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fmtDate(h.timestamp)}</div>
              {h.summary && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.summary}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: C.gold, lineHeight: 1 }}>{h.score}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{scoreLabel(h.score)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── TipsScreen ───────────────────────────────────────────────────────────────
function TipsScreen() {
  const [activeCat, setActiveCat] = useState(0)
  const [expanded, setExpanded] = useState(null)
  return (
    <div>
      <div style={{ background: C.green, padding: '54px 20px 0' }}>
        <h2 style={{ color: C.gold, fontSize: 22, fontWeight: 800, margin: 0 }}>Tips Library</h2>
        <p style={{ color: C.cream, fontSize: 13, margin: '4px 0 18px', opacity: 0.7 }}>Expert techniques to elevate your game</p>
        <div className="scroll-hide" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 16 }}>
          {TIPS_DATA.map((cat, i) => (
            <button key={i} onClick={() => { setActiveCat(i); setExpanded(null) }} style={{ flexShrink: 0, padding: '9px 18px', borderRadius: 50, border: 'none', cursor: 'pointer', background: activeCat === i ? C.gold : 'rgba(255,255,255,0.14)', color: activeCat === i ? C.green : C.cream, fontWeight: 700, fontSize: 13, minHeight: 44 }}>
              {cat.icon} {cat.category}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '16px' }} className="fade-in-fast">
        {TIPS_DATA[activeCat].tips.map((tip, i) => (
          <button key={i} onClick={() => setExpanded(expanded === i ? null : i)} style={{ width: '100%', background: C.white, border: 'none', borderRadius: 18, padding: '18px', textAlign: 'left', cursor: 'pointer', marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', display: 'block', minHeight: 58 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: C.green, paddingRight: 12 }}>{tip.title}</span>
              <span style={{ color: C.gold, fontSize: 18, flexShrink: 0, display: 'inline-block', transition: 'transform 0.2s', transform: expanded === i ? 'rotate(180deg)' : 'none' }}>▾</span>
            </div>
            {expanded === i && <p style={{ margin: '12px 0 0', fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{tip.body}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── ProfileScreen ────────────────────────────────────────────────────────────
function ProfileScreen({ history }) {
  const avgScore = history.length ? Math.round(history.reduce((s, h) => s + h.score, 0) / history.length) : null
  const best = history.length ? Math.max(...history.map((h) => h.score)) : null
  const trend = history.length >= 2 ? history[0].score - history[history.length - 1].score : null
  return (
    <div>
      <div style={{ background: C.green, padding: '54px 24px 28px', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: C.greenLight, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38 }}>👤</div>
        <h2 style={{ color: C.cream, fontSize: 20, fontWeight: 800, margin: 0 }}>My Profile</h2>
        <p style={{ color: C.gold, fontSize: 13, margin: '4px 0 0', fontWeight: 600 }}>Amateur Golfer</p>
      </div>
      <div style={{ padding: '20px 16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[{ label: 'Sessions', value: history.length || '0' }, { label: 'Avg Score', value: avgScore ?? '—' }, { label: 'Best', value: best ?? '—' }].map((s) => (
            <div key={s.label} style={{ background: C.white, borderRadius: 16, padding: '16px 10px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.gold }}>{s.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
        {trend !== null && (
          <div style={{ background: trend >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: 14, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>{trend >= 0 ? '📈' : '📉'}</span>
            <p style={{ margin: 0, fontSize: 13, color: trend >= 0 ? '#15803d' : C.error, fontWeight: 600 }}>{trend >= 0 ? `+${trend}` : trend} points since your first session</p>
          </div>
        )}
        <Card title="About SwingAI" icon="ℹ️">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, margin: 0 }}>SwingAI uses advanced AI vision to analyze your golf swing frame by frame, providing expert-level feedback powered by Google Gemini. Upload any swing video and receive a full breakdown in seconds.</p>
        </Card>
        <Card title="How It Works" icon="⚙️">
          {[['📱','Upload video from your camera roll'],['🤖','AI analyzes swing mechanics frame by frame'],['📊','Receive a detailed phase-by-phase breakdown'],['💡','Get personalized coaching tips to improve']].map(([icon, text]) => (
            <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}

// ─── BottomNav ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'analyze', label: 'Analyze', icon: '🎥' },
  { id: 'history', label: 'History', icon: '📋' },
  { id: 'tips',    label: 'Tips',    icon: '💡' },
  { id: 'profile', label: 'Profile', icon: '👤' },
]

function BottomNav({ active, setActive }) {
  return (
    <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 430, background: C.green, borderTop: `1px solid ${C.greenLight}`, display: 'flex', zIndex: 200, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {NAV_ITEMS.map((n) => (
        <button key={n.id} onClick={() => setActive(n.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', minHeight: 60, borderTop: active === n.id ? `2px solid ${C.gold}` : '2px solid transparent', transition: 'border-color 0.15s' }}>
          <span style={{ fontSize: 21, lineHeight: 1 }}>{n.icon}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: active === n.id ? C.gold : 'rgba(245,240,232,0.45)', letterSpacing: '0.03em' }}>{n.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [active, setActive] = useState('analyze')
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('swingai_history') || '[]') }
    catch { return [] }
  })
  useEffect(() => { localStorage.setItem('swingai_history', JSON.stringify(history)) }, [history])

  return (
    <div style={{ background: C.cream, minHeight: '100vh', maxWidth: 430, margin: '0 auto', position: 'relative', overflowX: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>
      <div style={{ paddingBottom: 76 }}>
        {active === 'analyze' && <AnalyzeScreen history={history} setHistory={setHistory} />}
        {active === 'history' && <HistoryScreen history={history} setHistory={setHistory} />}
        {active === 'tips'    && <TipsScreen />}
        {active === 'profile' && <ProfileScreen history={history} />}
      </div>
      <BottomNav active={active} setActive={setActive} />
    </div>
  )
}
