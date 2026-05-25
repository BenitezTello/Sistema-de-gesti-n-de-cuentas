import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useApp } from '../context/AppContext'

const ICONS = {
  success: CheckCircle,
  error:   AlertCircle,
  info:    Info,
  warning: AlertTriangle,
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp()

  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(toast => {
          const Icon = ICONS[toast.type] || Info
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 40, scale: 0.92 }}
              animate={{ opacity: 1, x: 0,  scale: 1 }}
              exit={{   opacity: 0, x: 40,  scale: 0.92 }}
              transition={{ duration: 0.2 }}
              className={`toast-item toast-${toast.type}`}
            >
              <Icon size={15} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{toast.message}</span>
              <button
                onClick={() => dismissToast(toast.id)}
                style={{ opacity: 0.6, background: 'none', cursor: 'pointer', padding: '2px', display: 'flex' }}
              >
                <X size={13} />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
