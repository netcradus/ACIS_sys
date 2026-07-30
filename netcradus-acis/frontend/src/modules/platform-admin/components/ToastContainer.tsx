import { CheckCircle2, XCircle, X } from 'lucide-react'
import { usePlatformToastStore } from '@/store/platformToastStore'

export default function ToastContainer() {
  const { toasts, dismiss } = usePlatformToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 p-4 rounded-xl border shadow-2xl animate-slide-up bg-surface-2 ${
            toast.type === 'success' ? 'border-success/30' : 'border-danger/30'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-danger flex-shrink-0 mt-0.5" />
          )}
          <p className="text-xs font-semibold text-text-secondary flex-1 leading-relaxed">{toast.message}</p>
          <button onClick={() => dismiss(toast.id)} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
