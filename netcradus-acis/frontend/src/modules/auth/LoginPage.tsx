import { Shield, Lock, Globe, ArrowRight } from 'lucide-react'
import keycloak from '../../lib/keycloak'
import { useAuthStore } from '../../store/authStore'
import { Navigate } from 'react-router-dom'

export default function LoginPage() {
  const { isAuthenticated } = useAuthStore()

  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const handleLogin = () => {
    keycloak.login()
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-6">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-1/2 h-1/2 bg-accent/10 blur-[150px] rounded-full" />
        <div className="absolute -bottom-1/4 -right-1/4 w-1/2 h-1/2 bg-secondary/10 blur-[150px] rounded-full" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Logo Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-accent shadow-accent-glow mb-6 transform hover:scale-105 transition-transform">
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-2">
            ACIS <span className="text-accent underline decoration-4 underline-offset-8">System</span>
          </h1>
          <p className="text-text-secondary font-medium tracking-wide">
            Automated Cyber Incident & Security
          </p>
        </div>

        {/* Action Card */}
        <div className="bg-glass-surface border-fire-border/40 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-sm text-text-muted mb-8 italic">Please sign in to access the command center</p>

            <div className="space-y-4">
              <button
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-3 bg-accent hover:bg-accent-dark text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-accent-glow group"
              >
                <Lock className="w-5 h-5 group-hover:animate-bounce" />
                Sign In with SSO
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-3 bg-surface-2 hover:bg-surface-3 text-text-primary font-semibold py-4 rounded-xl border border-surface-3 transition-all"
              >
                <Globe className="w-5 h-5 text-text-secondary" />
                Continue with Corporate SSO
              </button>
            </div>

            <div className="mt-8 text-center">
              <p className="text-[10px] text-text-muted uppercase tracking-[0.2em] font-bold">
                Secured by Keycloak Enterprise
              </p>
            </div>
          </div>

          {/* Card Accent */}
          <div className="absolute top-0 right-0 w-28 h-28 bg-accent/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-secondary/10 blur-3xl" />
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-text-muted font-medium">
            &copy; 2024 Netcradus Advanced Cyber Infrastructure. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
