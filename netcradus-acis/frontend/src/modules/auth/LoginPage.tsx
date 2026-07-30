import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, Scan, Brain, Monitor, Database, ShieldAlert, Activity, ArrowRight } from 'lucide-react'
import keycloak from '../../lib/keycloak'
import { useAuthStore, useHasRole } from '../../store/authStore'
import { Navigate } from 'react-router-dom'

export default function LoginPage() {
  const { isAuthenticated } = useAuthStore()
  const isUserAuthenticated = isAuthenticated || Boolean(keycloak.authenticated)
  const isPlatformAdmin = useHasRole('platform-admin')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
      redirectUri: `${window.location.origin}/dashboard`,
      loginHint: username || undefined,
    })
  }

  const stats = [
    {
      label: 'Threats Blocked',
      value: '1,248',
      trend: '↑ 18.6% vs yesterday',
      trendUp: true,
      icon: Scan,
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10',
    },
    {
      label: 'AI Confidence',
      value: '99.8%',
      trend: '↑ 2.4% vs yesterday',
      trendUp: true,
      icon: Brain,
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
    },
    {
      label: 'Endpoints Protected',
      value: '4,328',
      trend: '↑ 156 vs yesterday',
      trendUp: true,
      icon: Monitor,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
    },
    {
      label: 'Events Processed',
      value: '14.2M',
      trend: '↑ 28.1% vs yesterday',
      trendUp: true,
      icon: Database,
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
    },
    {
      label: 'Active Incidents',
      value: '03',
      trend: '↓ 25% vs yesterday',
      trendUp: false, // Down is good for incidents, but styled red in mockup
      icon: ShieldAlert,
      iconColor: 'text-cyan-400',
      iconBg: 'bg-cyan-500/10',
    },
    {
      label: 'System Health',
      value: '98%',
      trend: '↑ 1.6% vs yesterday',
      trendUp: true,
      icon: Activity,
      iconColor: 'text-purple-400',
      iconBg: 'bg-purple-500/10',
    },
  ]

  return (
    <div className="min-h-screen w-screen bg-[#02050e] text-white flex flex-col lg:flex-row overflow-x-hidden relative font-sans">
      <style>{`
        @keyframes hologram-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes hologram-pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.7; }
        }
        @keyframes beam-float-1 {
          0% { transform: translateY(80px); opacity: 0; }
          30% { opacity: 0.8; }
          70% { opacity: 0.8; }
          100% { transform: translateY(-120px); opacity: 0; }
        }
        @keyframes beam-float-2 {
          0% { transform: translateY(60px); opacity: 0; }
          40% { opacity: 0.9; }
          80% { opacity: 0.9; }
          100% { transform: translateY(-160px); opacity: 0; }
        }
        @keyframes beam-float-3 {
          0% { transform: translateY(100px); opacity: 0; }
          20% { opacity: 0.7; }
          70% { opacity: 0.7; }
          100% { transform: translateY(-100px); opacity: 0; }
        }
        .animate-rotate {
          animation: hologram-rotate 25s linear infinite;
        }
        .animate-pulse-hologram {
          animation: hologram-pulse 4s ease-in-out infinite;
        }
        .animate-beam-1 {
          animation: beam-float-1 3.5s ease-in-out infinite;
        }
        .animate-beam-2 {
          animation: beam-float-2 4.5s ease-in-out infinite;
        }
        .animate-beam-3 {
          animation: beam-float-3 5.5s ease-in-out infinite;
        }
      `}</style>

      {/* Global Background Image (Behind Everything) */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-30 pointer-events-none mix-blend-screen"
        style={{ backgroundImage: `url('/world-network.png')` }}
      />

      {/* Left Column: Branding and Stats */}
      <div className="w-full lg:w-[58%] flex flex-col justify-between p-8 lg:p-16 relative z-10 min-h-[50vh] lg:min-h-screen">
        {/* Decorative Grid & glows */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10">
          <div className="absolute top-[10%] left-[5%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[10%] right-[10%] w-[30%] h-[30%] bg-purple-500/10 blur-[100px] rounded-full" />
        </div>

        {/* Heading Section */}
        <div className="max-w-2xl">
          <h1 className="text-4xl lg:text-6xl font-extrabold text-white leading-tight tracking-tight">
            Autonomous<br />
            Cyber Immune<br />
            System
          </h1>

          <div className="mt-8 space-y-2 text-lg lg:text-xl font-medium tracking-wide">
            <p className="text-slate-300">Real-Time <span className="text-[#0ea5e9] font-bold">Detection.</span></p>
            <p className="text-slate-300">Intelligent <span className="text-[#a855f7] font-bold">Response.</span></p>
            <p className="text-slate-300">Continuous <span className="text-[#3b82f6] font-bold">Protection.</span></p>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6 max-w-4xl mt-12 relative z-20">
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <div 
                key={index} 
                className="bg-[#0b1329]/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 lg:p-5 hover:border-white/15 hover:bg-[#0b1329]/60 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl ${stat.iconBg}`}>
                    <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                  </div>
                  <span className="text-xs lg:text-sm font-semibold text-slate-400">{stat.label}</span>
                </div>
                <div className="mt-4">
                  <span className="text-2xl lg:text-3xl font-extrabold text-white tracking-tight">{stat.value}</span>
                  <div className={`flex items-center gap-1 mt-1 text-[10px] lg:text-xs font-semibold ${stat.trendUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <span>{stat.trend}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Holographic Concentric Floor Element */}
        <div className="absolute bottom-[-100px] left-1/2 -translate-x-1/2 w-[350px] h-[200px] pointer-events-none select-none z-0 hidden lg:block">
          <div className="w-full h-full relative" style={{ perspective: '600px' }}>
            <div className="absolute inset-0 mx-auto w-[300px] h-[300px] rounded-full border border-blue-500/20 bg-blue-500/[0.02] transform rotateX(75deg) origin-center animate-pulse-hologram flex items-center justify-center">
              <div className="w-[80%] h-[80%] rounded-full border border-dashed border-cyan-500/30 animate-rotate flex items-center justify-center">
                <div className="w-[60%] h-[60%] rounded-full border border-double border-purple-500/40 bg-purple-500/[0.03]">
                  <div className="w-[40%] h-[40%] rounded-full bg-cyan-500/20 blur-md absolute inset-0 m-auto" />
                </div>
              </div>
            </div>
            
            {/* Hologram Light Beams */}
            <div className="absolute bottom-[100px] left-1/4 w-[2px] h-[80px] bg-gradient-to-t from-transparent via-cyan-400 to-transparent opacity-60 animate-beam-1" />
            <div className="absolute bottom-[100px] left-1/2 -translate-x-1/2 w-[3px] h-[120px] bg-gradient-to-t from-transparent via-purple-400 to-transparent opacity-80 animate-beam-2" />
            <div className="absolute bottom-[100px] right-1/4 w-[2px] h-[70px] bg-gradient-to-t from-transparent via-cyan-400 to-transparent opacity-50 animate-beam-3" />
          </div>
        </div>
      </div>

      {/* Right Column: Floating Login Card */}
      <div className="w-full lg:w-[42%] flex items-center justify-center p-4 lg:p-8 relative z-10 min-h-screen">
        <div className="w-full max-w-[480px] bg-white text-gray-900 rounded-[32px] p-6 lg:p-10 shadow-2xl flex flex-col justify-between border border-gray-100 min-h-[85vh] lg:min-h-[90vh]">
          {/* Header Logos */}
          <div className="flex flex-col items-center w-full">
            {/* ACIS Logo */}
            <div className="flex flex-col items-center">
              <div className="flex items-start select-none">
                <svg className="h-10 w-auto" viewBox="0 0 160 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Stylized A */}
                  <path d="M18 42L33 6H43L28 42H18Z" fill="#000000" />
                  <path d="M29 16L40 42H50L35 6L29 16Z" fill="#F96302" />
                  {/* CIS Text */}
                  <text x="56" y="40" fill="#F96302" fontWeight="800" fontSize="36" fontFamily="'Inter', system-ui, sans-serif" letterSpacing="-0.03em">CIS</text>
                  {/* TM Symbol */}
                  <text x="122" y="18" fill="#000000" fontWeight="700" fontSize="8" fontFamily="'Inter', system-ui, sans-serif">TM</text>
                </svg>
              </div>
              <span className="text-[8px] font-bold tracking-[0.3em] text-gray-900 uppercase mt-1.5 select-none font-sans">
                AUTONOMOUS CYBER IMMUNE SYSTEM
              </span>
            </div>

            {/* Divider Powered by */}
            <div className="flex items-center gap-2 w-full max-w-[150px] mx-auto my-3">
              <div className="h-[1px] bg-gray-200 flex-1"></div>
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Powered by</span>
              <div className="h-[1px] bg-gray-200 flex-1"></div>
            </div>

            {/* Netcradus Logo */}
            <div className="flex items-center justify-center font-sans tracking-[0.08em] text-lg font-black select-none">
              <span className="text-gray-950">NET</span>
              <span className="text-[#F96302]">CRADUS</span>
              <span className="text-[#F96302] text-xs font-bold -mt-2">™</span>
            </div>
          </div>

          {/* Form and Sign in header */}
          <div className="flex-1 flex flex-col justify-center my-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Welcome Back!</h2>
              <p className="text-xs text-gray-400 mt-1.5">Sign in to your ACIS Dashboard</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email/Username field */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                    required
                  />
                </div>
              </div>

              {/* Password field */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">
                  Password
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-4 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-white border border-gray-200 rounded-xl pl-12 pr-12 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all duration-200"
                    required
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

              {/* Remember me & Forgot Password */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-gray-600 font-medium select-none">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer" 
                  />
                  <span>Remember Me</span>
                </label>
                <span 
                  onClick={() => handleLogin()} 
                  className="text-blue-600 font-semibold hover:underline cursor-pointer"
                >
                  Forgot Password?
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all text-sm tracking-wide mt-2"
              >
                <span>Login</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center my-5">
              <div className="flex-1 h-[1px] bg-gray-200" />
              <span className="px-3 text-xs text-gray-400 font-bold uppercase tracking-wider">or</span>
              <div className="flex-1 h-[1px] bg-gray-200" />
            </div>

            {/* Social Logins */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleLogin()}
                className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-xl border border-gray-200 flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-[0.99] transition-all text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#f35022" d="M1 1h10v10H1z"/>
                  <path fill="#80bb0a" d="M12 1h10v10H12z"/>
                  <path fill="#00a1f1" d="M1 12h10v10H1z"/>
                  <path fill="#ffb900" d="M12 12h10v10H12z"/>
                </svg>
                <span>Continue with Microsoft</span>
              </button>

              <button
                type="button"
                onClick={() => handleLogin()}
                className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-xl border border-gray-200 flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-[0.99] transition-all text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21.35 11.1H12v2.7h5.38c-.24 1.28-.96 2.37-2.04 3.1v2.58h3.3c1.93-1.78 3.04-4.4 3.04-7.48 0-.6-.05-1.2-.15-1.72z" fill="#4285F4" />
                  <path d="M12 20.6c2.43 0 4.47-.8 5.96-2.2l-3.3-2.58c-.9.6-2.07.98-3.3.98-2.34 0-4.33-1.58-5.04-3.72H2.9v2.66c1.49 2.96 4.54 4.86 8.1 4.86z" fill="#34A853" />
                  <path d="M6.96 13.08c-.18-.54-.28-1.1-.28-1.68s.1-1.14.28-1.68V7.06H2.9c-.6 1.2-.9 2.56-.9 4 0 1.44.3 2.8.9 4l4.06-3.32z" fill="#FBBC05" />
                  <path d="M12 6.4c1.32 0 2.5.46 3.44 1.36l2.58-2.58C16.46 3.64 14.43 2.8 12 2.8c-3.56 0-6.61 1.9-8.1 4.86l4.06 3.32c.71-2.14 2.7-3.72 5.04-3.72z" fill="#EA4335" />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          </div>

          {/* Footer copyright */}
          <div className="text-center text-[10px] text-gray-400 font-medium space-y-0.5 mt-4">
            <p>© 2026 Netcradus Pvt Ltd</p>
            <p>Version 1.0.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
