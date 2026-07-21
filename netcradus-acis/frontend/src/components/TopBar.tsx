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

export default function TopBar() {
  const { user } = useAuthStore()
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
    <header className="h-20 border-b border-fire-border bg-black/80 backdrop-blur-md px-8 flex items-center justify-between z-20 sticky top-0 overflow-visible">
      <div className="flex items-center gap-6">
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted hidden lg:block border-r border-fire-border pr-6">
          Security Operations Center
        </h2>

        {/* Search Bar - Professional/Technical Look */}
        <div className="relative group min-w-[320px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-accent transition-colors" />
          <input
            type="text"
            placeholder="SEARCH ACIS INTEL..."
            className="w-full bg-surface-2 border border-fire-border rounded-xl py-2.5 pl-11 pr-12 text-[11px] font-bold text-white placeholder:text-text-muted focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/40 transition-all uppercase tracking-widest"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-1 bg-surface-3 border border-fire-border rounded-md">
            <Command className="w-3 h-3 text-text-muted" />
            <span className="text-[9px] font-bold text-text-muted">K</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6" ref={dropdownRef}>
        {/* Real-Time Notification Bell Button & Popover */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications)
              setShowProfile(false)
            }}
            aria-label="Security Notifications"
            className={clsx(
              "relative p-2.5 rounded-xl border transition-all group focus:outline-none",
              showNotifications 
                ? "bg-surface-3 border-accent text-white shadow-lg" 
                : "bg-surface-2 border-fire-border text-text-secondary hover:text-white hover:border-accent/40"
            )}
          >
            <Bell className={clsx("w-5 h-5 transition-transform", unreadCount > 0 && "animate-bounce-short")} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 bg-accent text-black font-black text-[10px] rounded-full border-2 border-black flex items-center justify-center shadow-lg animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Real-Time Notification Dropdown Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-4 w-[420px] max-w-[90vw] bg-surface-2 border border-fire-border rounded-2xl shadow-2xl z-50 animate-fade-in overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-fire-border bg-black/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-accent/10 border border-accent/20 text-accent">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-black uppercase tracking-widest text-white">Security Feed</h3>
                      <span className={clsx(
                        "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border flex items-center gap-1",
                        isWsConnected 
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                          : "bg-accent/10 text-accent border-accent/20"
                      )}>
                        <Radio className="w-2.5 h-2.5 animate-pulse" />
                        {isWsConnected ? 'LIVE WS' : 'STREAM ACTIVE'}
                      </span>
                    </div>
                    <p className="text-[10px] text-text-muted font-bold tracking-tight">Real-time incident & SIEM alerts stream</p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      title="Mark all as read"
                      className="p-1.5 text-text-muted hover:text-white hover:bg-surface-3 rounded-lg transition-colors text-[10px] font-bold flex items-center gap-1"
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
              <div className="flex items-center gap-1 px-4 py-2 bg-black/40 border-b border-fire-border text-[10px] font-black uppercase tracking-widest">
                <button
                  onClick={() => setFilter('ALL')}
                  className={clsx(
                    "px-3 py-1 rounded-lg transition-all",
                    filter === 'ALL' ? "bg-surface-3 text-white border border-fire-border" : "text-text-muted hover:text-white"
                  )}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter('UNREAD')}
                  className={clsx(
                    "px-3 py-1 rounded-lg transition-all flex items-center gap-1",
                    filter === 'UNREAD' ? "bg-accent/20 text-accent border border-accent/30" : "text-text-muted hover:text-white"
                  )}
                >
                  Unread ({unreadCount})
                </button>
                <button
                  onClick={() => setFilter('CRITICAL')}
                  className={clsx(
                    "px-3 py-1 rounded-lg transition-all flex items-center gap-1",
                    filter === 'CRITICAL' ? "bg-danger/20 text-danger border border-danger/30" : "text-text-muted hover:text-white"
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
                    <p className="text-xs font-bold text-white uppercase tracking-wider">No Security Alerts</p>
                    <p className="text-[10px] text-text-muted font-medium">No real-time incidents matching the current filter.</p>
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
                        "p-4 transition-all cursor-pointer hover:bg-surface-3 flex items-start gap-3 relative group",
                        !notif.read && "bg-surface-3/40"
                      )}
                    >
                      {/* Unread indicator dot */}
                      {!notif.read && (
                        <span className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      )}

                      {/* Severity Icon Badge */}
                      <div className={clsx(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-sm mt-0.5",
                        notif.severity === 'CRITICAL' && "bg-danger/10 text-danger border-danger/30",
                        notif.severity === 'HIGH' && "bg-warning/10 text-warning border-warning/30",
                        notif.severity === 'MEDIUM' && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                        (notif.severity === 'INFO' || notif.severity === 'LOW') && "bg-info/10 text-info border-info/30"
                      )}>
                        {notif.severity === 'CRITICAL' ? (
                          <Zap className="w-4 h-4 animate-pulse" />
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
                            "text-xs font-bold truncate leading-snug group-hover:text-accent transition-colors",
                            !notif.read ? "text-white" : "text-text-secondary"
                          )}>
                            {notif.title}
                          </h4>
                          <span className="text-[9px] font-mono font-bold text-text-muted shrink-0">
                            {formatTimeAgo(notif.timestamp)}
                          </span>
                        </div>
                        
                        <p className="text-[11px] text-text-muted line-clamp-2 leading-relaxed font-normal">
                          {notif.message}
                        </p>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[8px] font-black uppercase tracking-wider text-text-muted bg-black/60 border border-fire-border px-1.5 py-0.5 rounded">
                            {notif.source}
                          </span>

                          <span className={clsx(
                            "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border",
                            notif.severity === 'CRITICAL' && "bg-danger/20 text-danger border-danger/30",
                            notif.severity === 'HIGH' && "bg-warning/20 text-warning border-warning/30",
                            notif.severity === 'MEDIUM' && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                            (notif.severity === 'INFO' || notif.severity === 'LOW') && "bg-info/20 text-info border-info/30"
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
              <div className="p-3 border-t border-fire-border bg-black/80 flex items-center justify-between">
                <button
                  onClick={() => {
                    setShowNotifications(false)
                    navigate('/dashboard/alerts')
                  }}
                  className="w-full text-center py-2 text-[10px] font-black uppercase tracking-widest text-accent hover:text-white hover:bg-surface-3 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  View All Security Alerts <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Identity - Professional Layout */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProfile(!showProfile)
              setShowNotifications(false)
            }}
            className="flex items-center gap-4 transition-all group"
          >
            <div className="flex flex-col text-right hidden sm:flex">
              <p className="text-xs font-black text-white tracking-tight uppercase leading-none mb-1 group-hover:text-accent transition-colors">
                {user?.name || 'SECURITY OPERATOR'}
              </p>
              <p className="text-[9px] text-text-secondary font-bold uppercase tracking-[0.1em] leading-none">
                {user?.roles?.[0] || 'SUPER_ADMIN'} • ZONE_01
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-surface-2 border border-fire-border group-hover:border-accent/40 flex items-center justify-center text-accent font-black text-sm tracking-tighter shadow-lg transition-all overflow-hidden relative">
              <span className="relative z-10">{user?.name?.charAt(0).toUpperCase() || 'S'}</span>
              <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <ChevronDown className={clsx("w-4 h-4 text-text-muted transition-transform group-hover:text-white", showProfile && "rotate-180")} />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-4 w-56 bg-surface-2 border border-fire-border rounded-2xl shadow-2xl py-2 z-50 animate-fade-in divide-y divide-border overflow-visible">
              <div className="px-5 py-4">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-1">Session Identity</p>
                <p className="text-xs font-bold text-white truncate">{user?.email || 'operator@netcradus.local'}</p>
              </div>
              <div className="py-2">
                <button 
                  onClick={() => {
                    setShowProfile(false)
                    navigate('/dashboard/settings?tab=Profile')
                  }}
                  className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-text-secondary hover:text-white hover:bg-surface-3 transition-all flex items-center gap-3"
                >
                  <User className="w-4 h-4 text-accent" /> Profile Settings
                </button>
              </div>
              <div className="py-2">
                <button
                  onClick={() => keycloak.logout()}
                  className="w-full text-left px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-danger hover:bg-danger/10 transition-all flex items-center gap-3"
                >
                  <LogOut className="w-4 h-4" /> Terminate Session
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
