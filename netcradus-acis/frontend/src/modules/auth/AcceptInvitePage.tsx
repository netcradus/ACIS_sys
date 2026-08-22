import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import keycloak from '../../lib/keycloak'
import apiClient from '../../lib/apiClient'
import NetcradusLogo from '@/components/NetcradusLogo'

interface InvitationPreview {
  inviteeName: string
  inviteeEmail: string
  orgName: string
}

/**
 * Public, unauthenticated accept-invite flow — mirrors SignupPage in spirit
 * (no ProtectedRoute wrapper, since a real Keycloak login only gets
 * created once this form actually submits — see InvitationService on the
 * backend for why that's deliberate). The token in the URL is the same raw
 * value the invitation email links to; it's never persisted anywhere but
 * that email, so this page's only job is to hand it back to the accept
 * endpoint once the invitee picks a password.
 */
export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [loadingPreview, setLoadingPreview] = useState(true)
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) {
      setPreviewError('This invitation link is missing its token.')
      setLoadingPreview(false)
      return
    }
    apiClient
      .get<InvitationPreview>(`/api/invitations/${token}`)
      .then((res) => setPreview(res.data))
      .catch((err) => setPreviewError(err?.message || 'This invitation link is invalid or has expired.'))
      .finally(() => setLoadingPreview(false))
  }, [token])

  const goToLogin = () => {
    keycloak.login({
      redirectUri: `${window.location.origin}/dashboard`,
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (password.length < 8) {
      setSubmitError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await apiClient.post(`/api/invitations/${token}/accept`, { password })
      setDone(true)
    } catch (err: any) {
      setSubmitError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-screen bg-[#02050e] text-white flex flex-col lg:flex-row overflow-x-hidden relative font-sans">
      <div
        className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none mix-blend-screen"
        style={{ backgroundImage: `url('/world-network.png')` }}
      />

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

      <div className="w-full lg:w-[45%] flex items-center justify-center p-4 lg:p-8 relative z-10 min-h-screen">
        <div className="w-full max-w-[480px] bg-surface text-text-primary rounded-2xl p-6 lg:p-10 shadow-card border border-fire-border">
          <div className="flex flex-col items-center w-full mb-6">
            <NetcradusLogo size="md" />
          </div>

          {loadingPreview ? (
            <div className="text-center py-10">
              <Loader2 className="w-10 h-10 text-accent mx-auto mb-4 animate-spin" />
              <p className="text-small text-text-secondary">Checking your invitation…</p>
            </div>
          ) : previewError ? (
            <div className="text-center py-6">
              <XCircle className="w-14 h-14 text-danger mx-auto mb-4" />
              <h2 className="text-h2 text-text-primary mb-2">Invitation not valid</h2>
              <p className="text-small text-text-secondary mb-6">{previewError}</p>
              <button onClick={goToLogin} className="btn-mission w-full">
                Go to Sign In
              </button>
            </div>
          ) : done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-success mx-auto mb-4" />
              <h2 className="text-h2 text-text-primary mb-2">You're all set</h2>
              <p className="text-small text-text-secondary mb-6">
                Your account is active. Sign in with <strong className="text-text-primary">{preview?.inviteeEmail}</strong> and the password
                you just set.
              </p>
              <button onClick={goToLogin} className="btn-fire w-full">
                <span>Go to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-h1 text-text-primary">Join {preview?.orgName}</h2>
                <p className="text-small text-text-muted mt-1.5">
                  Set a password for <strong className="text-text-secondary">{preview?.inviteeEmail}</strong> to activate your account
                </p>
              </div>

              {submitError && (
                <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-small text-danger">
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
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
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
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
                  <span>{submitting ? 'Activating account…' : 'Activate account'}</span>
                  {!submitting && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
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
