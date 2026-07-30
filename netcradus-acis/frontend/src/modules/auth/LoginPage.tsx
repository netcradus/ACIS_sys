import { useState } from 'react'
import { User, Lock, Eye, EyeOff, Globe, ChevronDown, ShieldCheck } from 'lucide-react'
import keycloak from '../../lib/keycloak'
import { useAuthStore, useHasRole } from '../../store/authStore'
import { Navigate } from 'react-router-dom'
import NetcradusLogo from '../../components/NetcradusLogo'
import ThemeToggle from '../../components/ThemeToggle'

export default function LoginPage() {
  const { isAuthenticated } = useAuthStore()
  const isUserAuthenticated = isAuthenticated || Boolean(keycloak.authenticated)
  const isPlatformAdmin = useHasRole('platform-admin')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLangOpen, setIsLangOpen] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState('English')

  // If already authenticated, redirect based on role
  if (isUserAuthenticated) {
    if (isPlatformAdmin) {
      return <Navigate to="/platform-admin" replace />
    }
    return <Navigate to="/dashboard" replace />
  }

  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    keycloak.login({
      pkceMethod: 'S256',
      redirectUri: `${window.location.origin}/login`,
      loginHint: username || undefined,
    })
  }

  const features = [
    "Advanced threat detection with AI-powered analytics",
    "Autonomous threat response & real-time mitigation",
    "Continuous monitoring across NOC, SOC & cloud",
    "Unified and adaptive protection with zero trust"
  ]

  const languages = ['English', 'Español', 'Deutsch', 'Français']

  return (
    <div className="min-h-screen bg-background text-text-primary relative overflow-hidden flex flex-col justify-between p-6 md:p-12 font-sans">
      {/* Background Decorative Grid and Glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent/5 blur-[150px] rounded-full" />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.02] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:30px_30px]" />
      </div>

      {/* Theme Toggle — top-right corner, visible before any login attempt */}
      <div className="absolute top-6 right-6 md:top-10 md:right-12 z-20">
        <ThemeToggle accentClass="text-accent" />
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center my-auto z-10 relative">
        
        {/* Left Column: Brand Info */}
        <div className="lg:col-span-7 flex flex-col justify-center text-left">
          {/* Brand Logo */}
          <div className="mb-10">
            <NetcradusLogo size="xl" showTagline={true} />
          </div>

          {/* Heading */}
          <h2 className="text-3xl md:text-5xl font-extrabold text-text-primary leading-tight mb-6 max-w-xl">
            AI-Powered Protection.<br />
            Autonomous <span className="text-accent">Defense.</span>
          </h2>

          {/* Subtext */}
          <p className="text-sm md:text-base text-text-secondary leading-relaxed mb-10 max-w-lg">
            ACIS continuously monitors, detects, and neutralizes cyber threats in real-time so you can operate with confidence.
          </p>

          {/* Feature List */}
          <div className="space-y-6 max-w-lg">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-4 animate-fade-in" style={{ animationDelay: `${idx * 0.1}s` }}>
                <ShieldCheck className="w-6 h-6 text-accent flex-shrink-0" />
                <span className="text-sm md:text-base font-semibold text-text-primary/90">
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Login Card */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <div className="relative w-full max-w-[440px]">
            {/* Background Glow Wrapper to create the orange halo effect on the right/back of the card */}
            <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent blur-3xl opacity-60 rounded-3xl -z-10" />

            {/* Glassmorphic Login Form Card */}
            <div className="w-full bg-surface/90 border border-fire-border rounded-3xl p-8 md:p-10 shadow-card backdrop-blur-xl flex flex-col relative overflow-visible">

              {/* Language Selector Dropdown */}
              <div className="self-end mb-6 relative">
                <button
                  type="button"
                  onClick={() => setIsLangOpen(!isLangOpen)}
                  className="flex items-center gap-1.5 text-xs text-text-secondary border border-fire-border hover:border-accent/40 bg-surface-2/50 px-3.5 py-1.5 rounded-full hover:bg-surface-3 transition-all cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{selectedLanguage}</span>
                  <ChevronDown className="w-3 h-3 text-text-muted" />
                </button>

                {isLangOpen && (
                  <div className="absolute right-0 mt-1.5 w-32 bg-surface-2 border border-fire-border rounded-xl overflow-hidden shadow-2xl z-20">
                    {languages.map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          setSelectedLanguage(lang)
                          setIsLangOpen(false)
                        }}
                        className="w-full text-left px-4 py-2 text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-all"
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Title & Subtitle */}
              <div className="mb-8">
                <h3 className="text-2xl md:text-3xl font-extrabold text-text-primary mb-2 tracking-tight">
                  Welcome back
                </h3>
                <p className="text-xs md:text-sm text-text-secondary">
                  Don't have an account?{' '}
                  <span onClick={() => handleLogin()} className="text-accent hover:underline cursor-pointer font-medium">
                    Create one here
                  </span>
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleLogin} className="space-y-6">
                {/* Username Field */}
                <div>
                  <label className="text-xs font-semibold text-text-secondary block mb-2">
                    Username
                  </label>
                  <div className="relative flex items-center">
                    <User className="absolute left-4 w-4 h-4 text-text-muted" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username or email"
                      className="w-full bg-surface-2 border border-fire-border rounded-xl pl-12 pr-4 py-3.5 text-sm text-text-primary placeholder-text-muted focus:border-accent/50 focus:outline-none transition-all duration-200"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-semibold text-text-secondary">
                      Password
                    </label>
                    <span onClick={() => handleLogin()} className="text-xs text-accent hover:underline cursor-pointer font-semibold">
                      Forgot password?
                    </span>
                  </div>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-4 w-4 h-4 text-text-muted" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-surface-2 border border-fire-border rounded-xl pl-12 pr-12 py-3.5 text-sm text-text-primary placeholder-text-muted focus:border-accent/50 focus:outline-none transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-text-muted hover:text-text-secondary transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-accent-dark to-accent hover:opacity-90 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-accent/10 hover:shadow-accent/30 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-sm md:text-base tracking-wide"
                >
                  Sign In to Continue
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center my-6">
                <div className="flex-1 h-[1px] bg-fire-border" />
                <span className="px-3.5 text-[10px] uppercase tracking-widest text-text-muted font-bold">
                  or continue with
                </span>
                <div className="flex-1 h-[1px] bg-fire-border" />
              </div>

              {/* SSO Login Button */}
              <button
                onClick={() => handleLogin()}
                className="w-full bg-transparent hover:bg-surface-3 text-text-primary font-semibold py-3.5 rounded-xl border border-fire-border hover:border-accent/30 flex items-center justify-center gap-2.5 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-sm md:text-base"
              >
                {/* Google G Logo SVG */}
                <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21.35 11.1H12v2.7h5.38c-.24 1.28-.96 2.37-2.04 3.1v2.58h3.3c1.93-1.78 3.04-4.4 3.04-7.48 0-.6-.05-1.2-.15-1.72z" fill="#4285F4" />
                  <path d="M12 20.6c2.43 0 4.47-.8 5.96-2.2l-3.3-2.58c-.9.6-2.07.98-3.3.98-2.34 0-4.33-1.58-5.04-3.72H2.9v2.66c1.49 2.96 4.54 4.86 8.1 4.86z" fill="#34A853" />
                  <path d="M6.96 13.08c-.18-.54-.28-1.1-.28-1.68s.1-1.14.28-1.68V7.06H2.9c-.6 1.2-.9 2.56-.9 4 0 1.44.3 2.8.9 4l4.06-3.32z" fill="#FBBC05" />
                  <path d="M12 6.4c1.32 0 2.5.46 3.44 1.36l2.58-2.58C16.46 3.64 14.43 2.8 12 2.8c-3.56 0-6.61 1.9-8.1 4.86l4.06 3.32c.71-2.14 2.7-3.72 5.04-3.72z" fill="#EA4335" />
                </svg>
                Sign in with SSO
              </button>

              {/* Help Footer */}
              <div className="mt-8 text-center text-[11px] text-text-muted leading-relaxed font-medium">
                Need help? Contact your{' '}
                <span onClick={() => handleLogin()} className="text-accent hover:underline cursor-pointer font-semibold">
                  administrator
                </span>{' '}
                or{' '}
                <span onClick={() => handleLogin()} className="text-accent hover:underline cursor-pointer font-semibold">
                  Help Center
                </span>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* Page Footer */}
      <div className="w-full text-center mt-12 z-10 relative">
        <p className="text-[11px] text-text-muted tracking-wider">
          &copy; 2024 ACIS - All rights reserved.
        </p>
      </div>
    </div>
  )
}
