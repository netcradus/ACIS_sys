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
      pkceMethod: 'S256',
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
      {/* Background image (behind everything) */}
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
          <div className="mt-8 space-y-2 text-lg lg:text-xl font-medium tracking-wide">
            <p className="text-slate-300">Real-Time <span className="text-[#0ea5e9] font-bold">Detection.</span></p>
            <p className="text-slate-300">Intelligent <span className="text-[#a855f7] font-bold">Response.</span></p>
            <p className="text-slate-300">Continuous <span className="text-[#3b82f6] font-bold">Protection.</span></p>
          </div>
        </div>
      </div>

      {/* Right column: signup card */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-4 lg:p-8 relative z-10 min-h-screen">
        <div className="w-full max-w-[480px] bg-white text-gray-900 rounded-[32px] p-6 lg:p-10 shadow-2xl border border-gray-100">
          {/* Header */}
          <div className="flex flex-col items-center w-full mb-6">
            <NetcradusLogo size="md" />
          </div>

          {done ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">Account created!</h2>
              <p className="text-sm text-gray-500 mb-6">
                Sign in below, then check <strong>{email}</strong> for a verification link —
                you'll need to confirm it before your account is fully active.
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
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Create New Account</h2>
                <p className="text-xs text-gray-400 mt-1.5">Start your ACIS trial in minutes</p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-small font-semibold text-gray-700 block mb-1.5">Company Name</label>
                  <div className="relative flex items-center">
                    <Building2 className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-small font-semibold text-gray-700 block mb-1.5">Your Name</label>
                  <div className="relative flex items-center">
                    <User className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-small font-semibold text-gray-700 block mb-1.5">Email Address</label>
                  <div className="relative flex items-center">
                    <Mail className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                      required
                    />
                  </div>
                </div>

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
                  <span>{submitting ? 'Creating Account…' : 'Create Account'}</span>
                  {!submitting && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>

              <p className="text-center text-xs text-gray-500 mt-6">
                Already have an account?{' '}
                <button onClick={goToLogin} className="text-blue-600 font-semibold hover:underline">
                  Sign in
                </button>
              </p>
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
