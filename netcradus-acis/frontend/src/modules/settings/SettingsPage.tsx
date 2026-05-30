import { Settings, Sliders } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-accent/20 rounded-lg text-accent shadow-accent-glow">
          <Settings className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">System Configuration</h1>
          <p className="text-xs text-text-secondary font-medium tracking-widest uppercase mt-1">Platform Settings & Security Policies</p>
        </div>
      </div>
      <div className="relative min-h-[500px] bg-surface/30 border border-surface-2 rounded-3xl p-12 flex flex-col items-center justify-center text-center overflow-hidden">
        <div className="relative z-10">
          <div className="w-20 h-20 bg-surface-2 rounded-2xl flex items-center justify-center mb-8 mx-auto transform hover:rotate-6 transition-transform">
            <Sliders className="w-10 h-10 text-accent animate-pulse-slow" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4 tracking-tight">Global Controls — Phase 2</h2>
          <p className="text-text-secondary max-w-lg mx-auto text-sm leading-relaxed mb-8">
            Manage user roles, API keys, and notification preferences. Phase 2 will introduce tenant-specific branding and dark/light mode customization. Global SIEM ingestion filters can also be managed here.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/20 rounded-full text-accent font-bold text-[10px] uppercase tracking-widest font-mono">
            Admin Panel Core Loading
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[100px] rounded-full pointer-events-none" />
      </div>
    </div>
  )
}
