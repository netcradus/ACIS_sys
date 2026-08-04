import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // rgb(var(--x-rgb) / <alpha-value>) instead of a bare var(--x) hex
        // reference — Tailwind substitutes an opacity modifier (bg-accent/10)
        // into the <alpha-value> placeholder, but can only do that when the
        // channels are already separated; it can't decompose a hex string at
        // build time. A bare var(--x) makes /NN modifiers silently no-op to
        // fully transparent instead of erroring, which is what made this easy
        // to miss. text-secondary/text-muted have no -rgb companion yet since
        // they're not opacity-modified anywhere today — add one the same way
        // if that changes.
        background:    'rgb(var(--background-rgb) / <alpha-value>)',
        surface:       'rgb(var(--surface-rgb) / <alpha-value>)',
        'surface-2':   'rgb(var(--surface-2-rgb) / <alpha-value>)',
        'surface-3':   'rgb(var(--surface-3-rgb) / <alpha-value>)',
        accent:        'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-dark': 'rgb(var(--accent-dark-rgb) / <alpha-value>)',
        'accent-light': 'rgb(var(--accent-light-rgb) / <alpha-value>)',
        'accent-pa':      'rgb(var(--accent-pa-rgb) / <alpha-value>)',
        'accent-pa-dark': 'rgb(var(--accent-pa-dark-rgb) / <alpha-value>)',
        'text-primary':   'rgb(var(--text-primary-rgb) / <alpha-value>)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted':     'var(--text-muted)',
        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--warning-rgb) / <alpha-value>)',
        danger:  'rgb(var(--danger-rgb) / <alpha-value>)',
        info:    'rgb(var(--info-rgb) / <alpha-value>)',
        'severity-high':   'rgb(var(--severity-high-rgb) / <alpha-value>)',
        'severity-medium': 'rgb(var(--severity-medium-rgb) / <alpha-value>)',
        'fire-border':  'rgb(var(--border-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'monospace'],
      },
      // Disciplined type scale — replaces the old pattern of ad hoc
      // text-[9px]/text-[10px] uppercase-tracking-widest strings used for
      // nearly everything. text-label is the ONLY size still meant for
      // uppercase micro-text (real labels/badges/table headers); everything
      // else reads as normal-case, comfortably sized content.
      fontSize: {
        display: ['2rem',    { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '800' }],
        h1:      ['1.5rem',  { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '700' }],
        h2:      ['1.25rem', { lineHeight: '1.3',  letterSpacing: '-0.01em', fontWeight: '700' }],
        h3:      ['0.9375rem', { lineHeight: '1.4', fontWeight: '600' }],
        body:    ['0.875rem', { lineHeight: '1.55', fontWeight: '400' }],
        small:   ['0.8125rem', { lineHeight: '1.5', fontWeight: '500' }],
        label:   ['0.6875rem', { lineHeight: '1.4', letterSpacing: '0.06em', fontWeight: '600' }],
      },
      boxShadow: {
        'accent-glow': 'var(--shadow-accent-glow)',
        'success-glow': 'var(--shadow-success-glow)',
        'card':        'var(--shadow-card)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-in':   'slideIn 0.25s ease-out',
      },
      keyframes: {
        fadeIn:  { '0%': { opacity: '0' },                  '100%': { opacity: '1' } },
        slideIn: { '0%': { transform: 'translateX(-8px)', opacity: '0' }, '100%': { transform: 'translateX(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
