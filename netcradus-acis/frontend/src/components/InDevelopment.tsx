import React from 'react'
import { CloudOff, Construction, Zap } from 'lucide-react'

interface InDevelopmentProps {
  children?: React.ReactNode
}

export default function InDevelopment({ children }: InDevelopmentProps) {
  return (
    <div className="relative min-h-[400px]">
      {/* Dimmed Background Content (Optional) */}
      <div className="opacity-10 pointer-events-none select-none filter blur-[2px]">
        {children}
      </div>

      {/* Development Overlay */}
      <div className="absolute inset-0 flex items-center justify-center p-6 z-50">
        <div className="card-mission bg-background/80 backdrop-blur-md border-accent/40 max-w-md w-full p-12 text-center shadow-accent-glow animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-8">
            <Construction className="text-accent animate-pulse" size={32} />
          </div>

          <h2 className="text-2xl font-black text-text-primary tracking-widest uppercase mb-4">
            Module Under Development
          </h2>
          
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-[0.3em] leading-relaxed mb-8">
            This module is currently in the development phase and is being wired to its respective backend microservice.
          </p>
          
          <div className="flex items-center gap-2 justify-center text-[9px] font-black text-accent uppercase tracking-widest border border-accent/20 py-2 rounded-xl bg-accent/5">
            <Zap size={14} /> PHASE 4-5 INTEGRATION PENDING
          </div>
          
          <div className="mt-8 pt-8 border-t border-fire-border">
             <div className="flex items-center justify-center gap-2 text-text-muted text-[9px] font-bold uppercase tracking-widest">
                <CloudOff size={12} /> BACKEND SERVICE MISSING
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
