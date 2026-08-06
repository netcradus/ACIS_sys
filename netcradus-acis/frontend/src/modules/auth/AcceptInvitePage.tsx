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
      pkceMethod: 'S256',
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
          <div className="mt-8 space-y-2 text-lg lg:text-xl font-medium tracking-wide">
            <p className="text-slate-300">Real-Time <span className="text-[#0ea5e9] font-bold">Detection.</span></p>
            <p className="text-slate-300">Intelligent <span className="text-[#a855f7] font-bold">Response.</span></p>
            <p className="text-slate-300">Continuous <span className="text-[#3b82f6] font-bold">Protection.</span></p>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[45%] flex items-center justify-center p-4 lg:p-8 relative z-10 min-h-screen">
        <div className="w-full max-w-[480px] bg-white text-gray-900 rounded-[32px] p-6 lg:p-10 shadow-2xl border border-gray-100">
          <div className="flex flex-col items-center w-full mb-6">
            <NetcradusLogo size="md" />
          </div>

          {loadingPreview ? (
            <div className="text-center py-10">
              <Loader2 className="w-10 h-10 text-blue-500 mx-auto mb-4 animate-spin" />
              <p className="text-sm text-gray-500">Checking your invitation…</p>
            </div>
          ) : previewError ? (
            <div className="text-center py-6">
              <XCircle className="w-14 h-14 text-rose-500 mx-auto mb-4" />
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">Invitation not valid</h2>
              <p className="text-sm text-gray-500 mb-6">{previewError}</p>
              <button
                onClick={goToLogin}
                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl transition-all text-sm"
              >
                Go to Sign In
              </button>
            </div>
          ) : done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">You're all set</h2>
              <p className="text-sm text-gray-500 mb-6">
                Your account is active. Sign in with <strong>{preview?.inviteeEmail}</strong> and the password
                you just set.
              </p>
              <button
                onClick={goToLogin}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all text-sm"
              >
                <span>Go to Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Join {preview?.orgName}</h2>
                <p className="text-xs text-gray-400 mt-1.5">
                  Set a password for <strong>{preview?.inviteeEmail}</strong> to activate your account
                </p>
              </div>

              {submitError && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {submitError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-small font-semibold text-gray-700 block mb-1.5">Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-12 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                      required
                      minLength={8}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-small font-semibold text-gray-700 block mb-1.5">Confirm Password</label>
                  <div className="relative flex items-center">
                    <Lock className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all text-sm tracking-wide mt-2"
                >
                  <span>{submitting ? 'Activating account…' : 'Activate account'}</span>
                  {!submitting && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            </>
          )}

          <div className="text-center text-[10px] text-gray-400 font-medium space-y-0.5 mt-6">
            <p>© 2026 Netcradus Pvt Ltd</p>
            <p>Version 1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
