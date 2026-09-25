import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store'

export default function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div
      className="glass fade-up fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm"
      style={
        toast.kind === 'error'
          ? {
              background: 'linear-gradient(180deg, color-mix(in srgb, var(--danger) 90%, #fff 10%), var(--danger))',
              color: '#fff',
              boxShadow: 'var(--inset-light), var(--shadow-pop)'
            }
          : {
              background: 'color-mix(in srgb, var(--text) 90%, transparent)',
              color: 'var(--panel)',
              border: '1px solid color-mix(in srgb, #ffffff 8%, transparent)',
              boxShadow: 'var(--shadow-pop)'
            }
      }
    >
      {toast.kind === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
      <span className="max-w-md truncate">{toast.message}</span>
    </div>
  )
}
