import { useState } from 'react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPass, setShowPass] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Error al iniciar sesión'); return }
      localStorage.setItem('token', data.token)
      onLogin(data.username)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'radial-gradient(ellipse at top, #052e16 0%, #0a0a0a 50%, #000 100%)',
    }}>
      {/* Glow verde */}
      <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '700px', height: '350px',
        background: 'radial-gradient(ellipse, rgba(34,197,94,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '400px', position: 'relative' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '90px', height: '90px', borderRadius: '22px', marginBottom: '1rem',
            background: 'linear-gradient(135deg, rgba(22,163,74,0.25), rgba(34,197,94,0.15))',
            border: '1px solid rgba(34,197,94,0.35)',
            boxShadow: '0 0 40px rgba(34,197,94,0.15)',
          }}>
            <img
              src="/logo.png"
              alt="ABT Zone"
              style={{ width: '70px', height: '70px', objectFit: 'contain', borderRadius: '14px' }}
              onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block' }}
            />
            <span style={{ display: 'none', fontSize: '36px' }}>🐼</span>
          </div>
          <h1 style={{
            fontSize: 'clamp(1.5rem, 5vw, 1.9rem)',
            fontWeight: '800',
            color: '#f0fdf4',
            letterSpacing: '-0.5px',
            margin: 0,
          }}>
            ABT Streaming
          </h1>
          <p style={{ color: '#4ade80', fontSize: '0.8rem', marginTop: '4px', fontWeight: '500', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Gestión de cuentas
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(5,46,22,0.3)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: '20px',
          padding: 'clamp(1.25rem, 5vw, 2rem)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(34,197,94,0.1)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

            {/* Usuario */}
            <div>
              <label style={{
                display: 'block', color: '#86efac', fontSize: '0.72rem',
                fontWeight: '700', marginBottom: '8px',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>Usuario</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Tu usuario"
                required
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '12px 14px',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(34,197,94,0.25)',
                  borderRadius: '12px', color: '#f0fdf4',
                  fontSize: '0.95rem', outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  fontFamily: 'inherit',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(34,197,94,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(34,197,94,0.25)'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Contraseña */}
            <div>
              <label style={{
                display: 'block', color: '#86efac', fontSize: '0.72rem',
                fontWeight: '700', marginBottom: '8px',
                letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  required
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 44px 12px 14px',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: '12px', color: '#f0fdf4',
                    fontSize: '0.95rem', outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(34,197,94,0.6)'; e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(34,197,94,0.25)'; e.target.style.boxShadow = 'none' }}
                />
                <button type="button" onClick={() => setShowPass(p => !p)} style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#4ade80', fontSize: '1rem', padding: '4px',
                  opacity: 0.7,
                }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '10px', padding: '10px 14px',
                color: '#fca5a5', fontSize: '0.85rem', textAlign: 'center',
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Botón */}
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: loading
                ? 'rgba(22,163,74,0.4)'
                : 'linear-gradient(135deg, #15803d, #22c55e)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '12px',
              color: 'white', fontWeight: '700', fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(34,197,94,0.3)',
              letterSpacing: '0.02em',
              fontFamily: 'inherit',
            }}>
              {loading ? 'Iniciando...' : 'Ingresar →'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', color: '#166534', fontSize: '0.72rem', marginTop: '1.5rem' }}>
          ABT Zone © 2026
        </p>
      </div>
    </div>
  )
}
