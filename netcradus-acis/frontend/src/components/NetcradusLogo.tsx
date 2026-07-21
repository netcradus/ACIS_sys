import React from 'react'
import { clsx } from 'clsx'

interface NetcradusLogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showTagline?: boolean
  collapsed?: boolean
}

export default function NetcradusLogo({
  className,
  size = 'md',
  showTagline = false,
  collapsed = false,
}: NetcradusLogoProps) {
  const heightMap = {
    sm: 'h-8 md:h-9',
    md: 'h-10 md:h-12',
    lg: 'h-14 md:h-16',
    xl: 'h-16 md:h-20',
  }

  const iconSizeMap = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  }

  if (collapsed) {
    return (
      <div className={clsx("flex items-center justify-center w-full", className)}>
        <div className={clsx("rounded-2xl bg-[#FF5A1F]/15 border border-[#FF5A1F]/40 flex items-center justify-center p-2 shadow-[0_0_15px_rgba(255,90,31,0.25)] hover:scale-105 transition-all duration-300", iconSizeMap[size])}>
          <img
            src="/netcradus-logo.png"
            alt="NETCRADUS"
            className="w-full h-full object-contain filter brightness-125 contrast-125 drop-shadow-[0_0_8px_rgba(255,90,31,0.4)]"
          />
        </div>
      </div>
    )
  }

  return (
    <div className={clsx("flex flex-col select-none group", className)}>
      <div className="flex items-center gap-2">
        <img
          src="/netcradus-logo.png"
          alt="NETCRADUS ACIS"
          className={clsx(
            "object-contain filter brightness-110 contrast-125 drop-shadow-[0_0_12px_rgba(255,90,31,0.35)] group-hover:drop-shadow-[0_0_18px_rgba(255,90,31,0.55)] group-hover:scale-[1.02] transition-all duration-300",
            heightMap[size]
          )}
        />
      </div>
      {showTagline && (
        <span className="text-[10px] font-black tracking-[0.28em] text-[#FF5A1F] uppercase mt-1.5 font-mono drop-shadow-[0_0_8px_rgba(255,90,31,0.3)]">
          Autonomous Cyber Immune System
        </span>
      )}
    </div>
  )
}
