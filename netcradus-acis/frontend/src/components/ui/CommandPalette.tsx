import { useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowUpRight, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import type { NavItem } from '../navConfig'

export interface PaletteActionItem {
  id: string
  label: string
  icon?: LucideIcon
  onSelect: () => void
}

export interface PaletteEntityResult {
  id: string
  label: string
  sublabel?: string
  onSelect: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  navItems: NavItem[]
  actions?: PaletteActionItem[]
  /** Real entity lookup, wired per-console (e.g. AppLayout filters already-fetched alerts/assets client-side — no new backend endpoint). Debounced internally. */
  searchEntities?: (query: string) => Promise<PaletteEntityResult[]>
  accentClass?: 'accent' | 'accent-pa'
}

const ACCENT_TEXT = { accent: 'text-accent', 'accent-pa': 'text-accent-pa' } as const

/**
 * Global ⌘K / Ctrl+K command palette — finally wires up TopBar's previously
 * decorative search input + inert "⌘K" badge (zero handlers existed before
 * this component). Built on cmdk (headless) so all styling routes through
 * this codebase's own tokens, including the new --surface-overlay/
 * --shadow-overlay elevation tier meant for exactly this kind of popover.
 */
export default function CommandPalette({ open, onOpenChange, navItems, actions, searchEntities, accentClass = 'accent' }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [entityResults, setEntityResults] = useState<PaletteEntityResult[]>([])
  const requestId = useRef(0)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setEntityResults([])
    }
  }, [open])

  useEffect(() => {
    if (!searchEntities || query.trim().length < 2) {
      setEntityResults([])
      return
    }
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      try {
        const results = await searchEntities(query.trim())
        if (requestId.current === id) setEntityResults(results)
      } catch {
        if (requestId.current === id) setEntityResults([])
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query, searchEntities])

  function select(fn: () => void) {
    onOpenChange(false)
    fn()
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command Palette"
      shouldFilter={false}
      /* NOTE: cmdk's own `className` prop lands on the inner [cmdk-root]
         element, NOT the Radix Dialog.Content wrapper — actual fixed
         positioning/centering must go on `contentClassName` instead. The
         content wrapper spans the full viewport (for centering) with
         pointer-events-none so clicks in the empty margin fall through to
         the overlay underneath and close the palette via Radix's own
         click-outside handling; only the visible card re-enables them. */
      contentClassName="fixed inset-0 z-[120] flex items-start justify-center pt-[12vh] px-4 pointer-events-none"
      overlayClassName="fixed inset-0 z-[120] bg-background/80 backdrop-blur-sm"
    >
      <div className="pointer-events-auto w-full max-w-xl bg-surface-overlay border border-fire-border rounded-xl shadow-overlay overflow-hidden animate-scale-in">
        <div className="flex items-center gap-3 px-4 border-b border-fire-border">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Navigate, search entities, run actions…"
            className="w-full bg-transparent py-3.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <kbd className="text-label text-text-muted border border-fire-border rounded px-1.5 py-0.5 flex-shrink-0">Esc</kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="text-small text-text-muted text-center py-8">No results found.</Command.Empty>

          <Command.Group heading="Navigate" className="[&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5">
            {navItems
              .filter((item) => query.trim() === '' || item.label.toLowerCase().includes(query.toLowerCase()))
              .map((item) => (
                <Command.Item
                  key={item.path}
                  value={`nav-${item.path}`}
                  onSelect={() => select(() => navigate(item.path))}
                  className={clsx(
                    'flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-small text-text-primary cursor-pointer transition-colors',
                    'data-[selected=true]:bg-surface-2'
                  )}
                >
                  <item.icon className="w-4 h-4 text-text-muted flex-shrink-0" />
                  {item.label}
                </Command.Item>
              ))}
          </Command.Group>

          {entityResults.length > 0 && (
            <Command.Group heading="Entities" className="[&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 mt-1">
              {entityResults.map((r) => (
                <Command.Item
                  key={r.id}
                  value={`entity-${r.id}`}
                  onSelect={() => select(r.onSelect)}
                  className="flex items-center justify-between gap-3 px-2.5 py-2.5 rounded-lg text-small text-text-primary cursor-pointer transition-colors data-[selected=true]:bg-surface-2"
                >
                  <span className="min-w-0">
                    <span className="truncate block">{r.label}</span>
                    {r.sublabel && <span className="text-label text-text-muted truncate block">{r.sublabel}</span>}
                  </span>
                  <ArrowUpRight className={clsx('w-3.5 h-3.5 flex-shrink-0', ACCENT_TEXT[accentClass])} />
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {actions && actions.length > 0 && (
            <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-text-muted [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 mt-1">
              {actions
                .filter((a) => query.trim() === '' || a.label.toLowerCase().includes(query.toLowerCase()))
                .map((a) => (
                  <Command.Item
                    key={a.id}
                    value={`action-${a.id}`}
                    onSelect={() => select(a.onSelect)}
                    className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-small text-text-primary cursor-pointer transition-colors data-[selected=true]:bg-surface-2"
                  >
                    {a.icon && <a.icon className="w-4 h-4 text-text-muted flex-shrink-0" />}
                    {a.label}
                  </Command.Item>
                ))}
            </Command.Group>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}
