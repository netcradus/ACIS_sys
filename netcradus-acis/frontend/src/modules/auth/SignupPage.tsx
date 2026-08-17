import { useState } from 'react'
import { Building2, User, Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle2 } from 'lucide-react'
import keycloak from '../../lib/keycloak'
import apiClient from '../../lib/apiClient'
import NetcradusLogo from '@/components/NetcradusLogo'

export default function SignupPage() {
  const [companyName, setCompanyName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const goToLogin = () => {
    keycloak.login({
      redirectUri: `${window.location.origin}/dashboard`,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await apiClient.post('/api/platform/signup', {
        companyName,
        adminName,
        email,
        password,
      })
      setDone(true)
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-screen bg-[#02050e] text-white flex flex-col lg:flex-row overflow-x-hidden relative font-sans">
      {/* Background image (behind everything) — hero stays a fixed dark
          brand backdrop regardless of app theme, same as the Keycloak login
          theme's hero panel, for visual continuity across the whole
          pre-auth funnel (signup → login → accept-invite → activate). */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none mix-blend-screen"
        style={{ backgroundImage: `url('/world-network.png')` }}
      />

      {/* Left column: branding */}
      <div className="w-full lg:w-[55%] flex flex-col justify-center p-8 lg:p-16 relative z-10 min-h-[30vh] lg:min-h-screen">
        <div className="max-w-xl">
          <h1 className="text-4xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
            Autonomous<br />Cyber Immune<br />System
          </h1>
          <div className="mt-2 h-1 w-[72px] rounded-full bg-gradient-to-r from-accent-light to-accent-pa" />
          <div className="mt-6 space-y-2 text-lg lg:text-xl font-medium tracking-wide">
            <p className="text-slate-300">Real-Time <span className="text-accent-light font-bold">Detection.</span></p>
            <p className="text-slate-300">Intelligent <span className="text-[#A78BFA] font-bold">Response.</span></p>
            <p className="text-slate-300">Continuous <span className="text-accent-light font-bold">Protection.</span></p>
          </div>
        </div>
      </div>

      {/* Right column: signup card */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-4 lg:p-8 relative z-10 min-h-screen">
        <div className="w-full max-w-[480px] bg-surface text-text-primary rounded-2xl p-6 lg:p-10 shadow-card border border-fire-border">
          {/* Header */}
          <div className="flex flex-col items-center w-full mb-6">
            <NetcradusLogo size="md" />
          </div>

          {done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-success mx-auto mb-4" />
              <h2 className="text-h2 text-text-primary mb-2">Account created!</h2>
              <p className="text-small text-text-secondary mb-6">
                Sign in below, then check <strong className="text-text-primary">{email}</strong> for a verification link —
                you'll need to confirm it before your account is fully active.
              </p>
              <button onClick={goToLogin} className="btn-fire w-full">
                <span>Go to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-h1 text-text-primary">Create New Account</h2>
                <p className="text-small text-text-muted mt-1.5">Start your ACIS trial in minutes</p>
              </div>

              {error && (
                <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-small text-danger">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-label uppercase text-text-muted block mb-1.5">Company Name</label>
                  <div className="relative flex items-center">
                    <Building2 className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      className="input-field pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-label uppercase text-text-muted block mb-1.5">Your Name</label>
                  <div className="relative flex items-center">
                    <User className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Jane Doe"
                      className="input-field pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-label uppercase text-text-muted block mb-1.5">Email Address</label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="input-field pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-label uppercase text-text-muted block mb-1.5">Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="input-field pl-10 pr-11"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 text-text-muted hover:text-text-primary transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-label uppercase text-text-muted block mb-1.5">Confirm Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-3.5 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="input-field pl-10"
                      required
                    />
                  </div>
                </div>

                <button type="submit" disabled={submitting} className="btn-fire w-full mt-2">
                  <span>{submitting ? 'Creating Account…' : 'Create Account'}</span>
                  {!submitting && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <p className="text-center text-small text-text-secondary mt-6">
                Already have an account?{' '}
                <button onClick={goToLogin} className="text-accent font-semibold hover:underline">
                  Sign in
                </button>
              </p>
            </>
          )}

          <div className="text-center text-label text-text-muted space-y-0.5 mt-6">
            <p>© 2026 Netcradus Pvt Ltd</p>
            <p>Version 1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
