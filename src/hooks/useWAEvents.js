import { useEffect, useState, useCallback } from 'react'

const getToken    = () => localStorage.getItem('token')
const waFetch     = (path, opts = {}) => fetch(path, {
  ...opts,
  headers: { ...opts.headers, Authorization: `Bearer ${getToken()}` },
})

async function getSseToken() {
  const res = await waFetch('/api/auth/sse-token')
  if (!res.ok) throw new Error('No se pudo obtener token SSE')
  const { token } = await res.json()
  return token
}

export function useWAEvents() {
  const [status,    setStatus]    = useState('checking')
  const [qr,        setQR]        = useState(null)
  const [progress,  setProgress]  = useState(null)
  const [bulkDone,  setBulkDone]  = useState(null)
  const [isSending, setIsSending] = useState(false)
  const [backendOk, setBackendOk] = useState(true)

  useEffect(() => {
    let es
    let cancelled = false

    async function connect() {
      if (cancelled) return
      try {
        const sseToken = await getSseToken()
        if (cancelled) return

        es = new EventSource(`/api/wa/events?token=${sseToken}`)

        es.onopen = () => setBackendOk(true)

        es.onmessage = (e) => {
          const { type, data } = JSON.parse(e.data)
          if (type === 'status')    setStatus(data)
          if (type === 'qr')        setQR(data)
          if (type === 'progress')  setProgress(data)
          if (type === 'bulk-done') { setBulkDone(data); setIsSending(false); setProgress(null) }
        }

        es.onerror = () => {
          setBackendOk(false)
          es.close()
          if (!cancelled) setTimeout(connect, 5000)
        }
      } catch {
        setBackendOk(false)
        if (!cancelled) setTimeout(connect, 5000)
      }
    }

    connect()
    return () => { cancelled = true; if (es) es.close() }
  }, [])

  const connect = useCallback(async () => {
    await waFetch('/api/wa/connect', { method: 'POST' })
  }, [])

  const disconnect = useCallback(async () => {
    await waFetch('/api/wa/disconnect', { method: 'POST' })
  }, [])

  const sendBulk = useCallback(async (messages) => {
    if (status !== 'connected' || messages.length === 0) return false
    setIsSending(true)
    setBulkDone(null)
    setProgress({ current: 0, total: messages.length, sent: 0, failed: 0 })
    const res = await waFetch('/api/wa/send-bulk', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ messages }),
    })
    if (!res.ok) { setIsSending(false); setProgress(null); return false }
    return true
  }, [status])

  const resetDone = useCallback(() => setBulkDone(null), [])

  return { status, qr, progress, bulkDone, isSending, backendOk, connect, disconnect, sendBulk, resetDone }
}
