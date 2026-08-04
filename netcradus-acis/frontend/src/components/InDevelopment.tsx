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
        <div className="card-mission bg-background/90 backdrop-blur-md max-w-md w-full p-12 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-xl bg-accent/10 border border-accent/30 flex items-center justify-center mx-auto mb-6">
            <Construction className="text-accent animate-pulse" size={32} />
          </div>

          <h2 className="text-h2 text-text-primary mb-3">
            Module Under Development
          </h2>

          <p className="text-small text-text-secondary leading-relaxed mb-6">
            This module is currently in the development phase and is being wired to its respective backend microservice.
          </p>

          <div className="flex items-center gap-2 justify-center text-label text-accent uppercase border border-accent/20 py-2 rounded-lg bg-accent/5">
            <Zap size={14} /> Phase 4-5 Integration Pending
          </div>

          <div className="mt-6 pt-6 border-t border-fire-border">
             <div className="flex items-center justify-center gap-2 text-text-muted text-label uppercase">
                <CloudOff size={12} /> Backend Service Missing
             </div>
          </div>
        </div>
      </div>
    </div>
  )
}
