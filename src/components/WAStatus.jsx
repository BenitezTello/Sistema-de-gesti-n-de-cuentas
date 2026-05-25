import { motion, AnimatePresence } from 'framer-motion'
import { Wifi, WifiOff, QrCode, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'

const CFG = {
  checking:     { label: 'Verificando…',         dot: '#6366f1', spin: true  },
  disconnected: { label: 'Desconectado',          dot: '#ef4444', spin: false },
  connecting:   { label: 'Iniciando sesión…',     dot: '#f59e0b', spin: true  },
  qr:           { label: 'Escanea el código QR',  dot: '#6366f1', spin: false },
  connected:    { label: 'WhatsApp conectado ✓',  dot: '#10b981', spin: false },
  error:        { label: 'Servidor no disponible',dot: '#ef4444', spin: false },
}

export default function WAStatus({ status, qr, backendOk, onConnect, onDisconnect }) {
  const cfg = CFG[status] || CFG.disconnected
  const isConnected = status === 'connected'

  return (
    <div className="glass-card !p-0 overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className="relative">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isConnected ? 'bg-emerald-500/15' : 'bg-white/[0.05]'}`}>
              {isConnected ? (
                <Wifi size={17} className="text-emerald-400" />
              ) : status === 'error' ? (
                <AlertTriangle size={17} className="text-red-400" />
              ) : cfg.spin ? (
                <Loader2 size={17} className="text-indigo-400 animate-spin" />
              ) : (
                <WifiOff size={17} className="text-slate-500" />
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900"
              style={{ background: cfg.dot }} />
          </div>

          <div>
            <p className="text-sm font-bold text-slate-200 leading-none">WhatsApp</p>
            <p className="text-xs mt-0.5" style={{ color: cfg.dot }}>{cfg.label}</p>
          </div>
        </div>

        {/* Action button */}
        <div>
          {status === 'disconnected' && (
            <button className="btn-primary !py-2 !px-3 !text-xs" onClick={onConnect}>
              Conectar
            </button>
          )}
          {status === 'error' && (
            <button className="btn-secondary !py-2 !px-3 !text-xs gap-1.5" onClick={onConnect}>
              <RefreshCw size={12} /> Reintentar
            </button>
          )}
          {isConnected && (
            <button className="btn-ghost text-xs text-slate-600" onClick={onDisconnect}>
              Desconectar
            </button>
          )}
        </div>
      </div>

      {/* ── QR Panel ── */}
      <AnimatePresence>
        {status === 'qr' && qr && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <div className="flex flex-col sm:flex-row items-center gap-5 px-5 py-5">
              {/* QR code */}
              <div className="p-3 bg-white rounded-2xl flex-shrink-0 shadow-xl">
                <img src={qr} alt="QR WhatsApp" className="w-44 h-44" />
              </div>

              {/* Instructions */}
              <div className="space-y-3 text-center sm:text-left">
                <p className="font-bold text-slate-200">Vincula tu WhatsApp</p>
                <div className="space-y-2">
                  {[
                    'Abre WhatsApp en tu teléfono',
                    'Ve a ⋮ → Dispositivos vinculados',
                    'Toca "Vincular un dispositivo"',
                    'Escanea este código QR',
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <p className="text-sm text-slate-400">{step}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-600">
                  Solo necesitas hacer esto <strong className="text-slate-400">una vez</strong>. Después se reconecta solo.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Connecting indicator ── */}
      <AnimatePresence>
        {status === 'connecting' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/[0.06]"
          >
            <div className="px-5 py-3 flex items-center gap-2.5">
              <Loader2 size={13} className="text-indigo-400 animate-spin" />
              <p className="text-xs text-slate-500">Cargando sesión guardada, un momento…</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Backend error ── */}
      <AnimatePresence>
        {!backendOk && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-yellow-500/20"
          >
            <div className="px-5 py-3 bg-yellow-950/20 flex items-center gap-2">
              <Loader2 size={12} className="text-yellow-400 animate-spin flex-shrink-0" />
              <p className="text-xs text-yellow-400">
                Reconectando con el servidor WhatsApp…
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
