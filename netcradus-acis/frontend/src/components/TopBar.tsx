import { 
  Search, Bell, User, LogOut, ChevronDown, Command, CheckCheck, Trash2, 
  ShieldAlert, AlertTriangle, Zap, Check, X, Radio, ArrowRight, ShieldCheck
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import keycloak from '../lib/keycloak'
import { useAuthStore } from '../store/authStore'
import { useNotificationStore } from '../store/notificationStore'
import { clsx } from 'clsx'
import ThemeToggle from './ThemeToggle'

function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString)
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
    if (diffSec < 45) return 'Just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    return `${Math.floor(diffSec / 86400)}d ago`
  } catch (e) {
    return 'Recently'
  }
}

interface TopBarProps {
  onOpenPalette: () => void
}

export default function TopBar({ onOpenPalette }: TopBarProps) {
  const { user, clearAuth } = useAuthStore()
  const { 
    notifications, unreadCount, filter, setFilter, 
    markAsRead, markAllAsRead, clearAll, initNotifications, isWsConnected 
  } = useNotificationStore()

  const [showProfile, setShowProfile] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    initNotifications()
  }, [initNotifications])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
        setShowProfile(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'UNREAD') return !n.read
    if (filter === 'CRITICAL') return n.severity === 'CRITICAL'
    return true
  })

  return (
    <header className="h-16 border-b border-fire-border bg-background/80 backdrop-blur-md px-6 flex items-center justify-between z-20 sticky top-0 overflow-visible">
      <div className="flex items-center gap-6">
        <h2 className="text-label uppercase text-text-muted hidden lg:block border-r border-fire-border pr-6">
          Security Operations Center
        </h2>

        {/* Command Palette Trigger — real ⌘K search across nav + entities (see CommandPalette.tsx), not the previously-decorative input this replaced */}
        <button
          type="button"
          onClick={onOpenPalette}
          className="group flex items-center gap-2.5 min-w-[300px] input-field py-2 pl-3.5 pr-3 text-small text-left text-text-muted hover:border-accent/40 transition-colors"
        >
          <Search className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors flex-shrink-0" />
          <span className="flex-1">Search ACIS Intel...</span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-surface-3 border border-fire-border rounded flex-shrink-0">
            <Command className="w-3 h-3 text-text-muted" />
            <span className="text-label text-text-muted">K</span>
          </span>
        </button>
      </div>

      <div className="flex items-center gap-4" ref={dropdownRef}>
        <ThemeToggle accentClass="text-accent" />

        {/* Real-Time Notification Bell Button & Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications)
              setShowProfile(false)
            }}
            aria-label="Security Notifications"
            className={clsx(
              "relative p-2.5 rounded-lg border transition-colors group focus:outline-none",
              showNotifications
                ? "bg-surface-3 border-accent text-text-primary"
                : "bg-surface-2 border-fire-border text-text-secondary hover:text-text-primary hover:border-accent/40"
            )}
          >
            <Bell className={clsx("w-[18px] h-[18px]", unreadCount > 0 && "animate-bounce-short")} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-accent text-white font-semibold text-[10px] rounded-full border-2 border-background flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Real-Time Notification Dropdown Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-3 w-[400px] max-w-[90vw] bg-surface border border-fire-border rounded-xl shadow-card z-50 animate-fade-in overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-fire-border flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-h3 text-text-primary">Security Feed</h3>
                      <span className={clsx(
                        "text-label uppercase px-1.5 py-0.5 rounded border flex items-center gap-1",
                        isWsConnected
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-accent/10 text-accent border-accent/20"
                      )}>
                        <Radio className="w-2.5 h-2.5 animate-pulse" />
                        {isWsConnected ? 'Live' : 'Stream'}
                      </span>
                    </div>
                    <p className="text-small text-text-muted">Real-time incident & SIEM alerts</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      title="Mark all as read"
                      className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-3 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5 text-accent" />
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAll}
                      title="Clear all notifications"
                      className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 px-4 py-2 bg-surface-2/60 border-b border-fire-border text-small font-medium">
                <button
                  onClick={() => setFilter('ALL')}
                  className={clsx(
                    "px-3 py-1 rounded-md transition-colors",
                    filter === 'ALL' ? "bg-surface-3 text-text-primary border border-fire-border" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter('UNREAD')}
                  className={clsx(
                    "px-3 py-1 rounded-md transition-colors flex items-center gap-1",
                    filter === 'UNREAD' ? "bg-accent/15 text-accent border border-accent/30" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  Unread ({unreadCount})
                </button>
                <button
                  onClick={() => setFilter('CRITICAL')}
                  className={clsx(
                    "px-3 py-1 rounded-md transition-colors flex items-center gap-1",
                    filter === 'CRITICAL' ? "bg-danger/15 text-danger border border-danger/30" : "text-text-muted hover:text-text-primary"
                  )}
                >
                  Critical ({notifications.filter(n => n.severity === 'CRITICAL').length})
                </button>
              </div>

              {/* Notifications List */}
              <div className="max-h-[360px] overflow-y-auto divide-y divide-fire-border/50 scrollbar-hide">
                {filteredNotifications.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <ShieldCheck className="w-8 h-8 text-text-muted mx-auto" />
                    <p className="text-small font-semibold text-text-primary">No security alerts</p>
                    <p className="text-small text-text-muted">No real-time incidents matching the current filter.</p>
                  </div>
                ) : (
                  filteredNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => {
                        markAsRead(notif.id)
                        setShowNotifications(false)
                        if (notif.actionUrl) navigate(notif.actionUrl)
                      }}
                      className={clsx(
                        "p-4 transition-colors cursor-pointer hover:bg-surface-2 flex items-start gap-3 relative group",
                        !notif.read && "bg-surface-2/50"
                      )}
                    >
                      {/* Unread indicator dot */}
                      {!notif.read && (
                        <span className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-accent" />
                      )}

                      {/* Severity Icon Badge */}
                      <div className={clsx(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border mt-0.5",
                        notif.severity === 'CRITICAL' && "bg-danger/10 text-danger border-danger/30",
                        notif.severity === 'HIGH' && "bg-warning/10 text-warning border-warning/30",
                        notif.severity === 'MEDIUM' && "bg-severity-medium/10 text-severity-medium border-severity-medium/30",
                        (notif.severity === 'INFO' || notif.severity === 'LOW') && "bg-info/10 text-info border-info/30"
                      )}>
                        {notif.severity === 'CRITICAL' ? (
                          <Zap className="w-4 h-4" />
                        ) : notif.severity === 'HIGH' ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <ShieldAlert className="w-4 h-4" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className={clsx(
                            "text-small font-semibold truncate leading-snug group-hover:text-accent transition-colors",
                            !notif.read ? "text-text-primary" : "text-text-secondary"
                          )}>
                            {notif.title}
                          </h4>
                          <span className="text-label text-text-muted shrink-0">
                            {formatTimeAgo(notif.timestamp)}
                          </span>
                        </div>

                        <p className="text-small text-text-muted line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-label uppercase text-text-muted bg-surface-2 border border-fire-border px-1.5 py-0.5 rounded">
                            {notif.source}
                          </span>

                          <span className={clsx(
                            "text-label uppercase px-1.5 py-0.5 rounded border",
                            notif.severity === 'CRITICAL' && "bg-danger/15 text-danger border-danger/30",
                            notif.severity === 'HIGH' && "bg-warning/15 text-warning border-warning/30",
                            notif.severity === 'MEDIUM' && "bg-severity-medium/15 text-severity-medium border-severity-medium/30",
                            (notif.severity === 'INFO' || notif.severity === 'LOW') && "bg-info/15 text-info border-info/30"
                          )}>
                            {notif.severity}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-fire-border flex items-center justify-between">
                <button
                  onClick={() => {
                    setShowNotifications(false)
                    navigate('/dashboard/alerts')
                  }}
                  className="btn-ghost w-full"
                >
                  View all security alerts <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Identity */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProfile(!showProfile)
              setShowNotifications(false)
            }}
            className="flex items-center gap-3 transition-colors group"
          >
            <div className="flex flex-col text-right hidden sm:flex">
              <p className="text-small font-semibold text-text-primary leading-tight group-hover:text-accent transition-colors">
                {user?.name || 'Security Operator'}
              </p>
              <p className="text-label uppercase text-text-muted leading-tight">
                {user?.roles?.[0] || 'Admin'} • Zone_01
              </p>
            </div>
            <div className="w-9 h-9 rounded-full bg-surface-2 border border-fire-border group-hover:border-accent/40 flex items-center justify-center text-accent font-semibold text-sm transition-colors overflow-hidden relative">
              <span className="relative z-10">{user?.name?.charAt(0).toUpperCase() || 'S'}</span>
            </div>
            <ChevronDown className={clsx("w-4 h-4 text-text-muted transition-transform group-hover:text-text-primary", showProfile && "rotate-180")} />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-3 w-56 bg-surface border border-fire-border rounded-xl shadow-card py-2 z-50 animate-fade-in divide-y divide-fire-border overflow-visible">
              <div className="px-4 py-3">
                <p className="text-label uppercase text-text-muted mb-1">Session Identity</p>
                <p className="text-small font-semibold text-text-primary truncate">{user?.email || 'operator@netcradus.local'}</p>
              </div>
              <div className="py-1.5">
                <button
                  onClick={() => {
                    setShowProfile(false)
                    navigate('/dashboard/settings?tab=Profile')
                  }}
                  className="w-full text-left px-4 py-2.5 text-small font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors flex items-center gap-3"
                >
                  <User className="w-4 h-4 text-accent" /> Profile Settings
                </button>
              </div>
              <div className="py-1.5">
                <button
                  onClick={() => { clearAuth(); keycloak.logout() }}
                  className="w-full text-left px-4 py-2.5 text-small font-medium text-danger hover:bg-danger/10 transition-colors flex items-center gap-3"
                >
                  <LogOut className="w-4 h-4" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
