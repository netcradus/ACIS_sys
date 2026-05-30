import { FileText, Printer } from 'lucide-react'

export default function ReportsPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-accent/20 rounded-lg text-accent shadow-accent-glow">
          <FileText className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Critical Reporting</h1>
          <p className="text-xs text-text-secondary font-medium tracking-widest uppercase mt-1">Automated PDF Generation & Scheduled Delivery</p>
        </div>
      </div>
      <div className="relative min-h-[500px] bg-surface/30 border border-surface-2 rounded-3xl p-12 flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="relative z-10">
          <div className="w-20 h-20 bg-surface-2 rounded-2xl flex items-center justify-center mb-8 mx-auto transform hover:rotate-6 transition-transform">
            <Printer className="w-10 h-10 text-accent animate-pulse-slow" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Report Generator — Phase 4</h2>
          <p className="text-text-secondary max-w-lg mx-auto text-sm leading-relaxed mb-8">
            Create high-level executive summaries or deep-dive technical post-mortems using our visual template engine. Schedule reports for delivery via Email, Slack, or secure download link.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 rounded-full text-accent font-bold text-[10px] uppercase tracking-widest">
            Template Engines Calibrating
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[100px] rounded-full pointer-events-none" />
      </div>
    </div>
  )
}
