import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store'

export default function Toast() {
  const toast = useStore((s) => s.toast)
  if (!toast) return null
  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-sm shadow-lg"
      style={
        toast.kind === 'error'
          ? { background: 'var(--danger)', color: '#fff' }
          : { background: 'var(--text)', color: 'var(--panel)' }
      }
    >
      {toast.kind === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
      <span className="max-w-md truncate">{toast.message}</span>
    </div>
  )
}
