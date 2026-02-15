'use client'

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export default function Home() {
  const { user, role, loading, signOut, signIn, testSignIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!email) {
      setEmailError(null)
      return true
    }
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address')
      return false
    }
    setEmailError(null)
    return true
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setEmail(value)
    if (value) validateEmail(value)
  }

  useEffect(() => {
    if (!loading && user && role) {
      router.push('/dashboard')
    }
  }, [user, role, loading, router])

  const handleSignOut = async () => {
    await signOut();
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSigningIn(true)

    try {
      const isTestUser = email === 'doctor@myclinicmd.com' || email === 'nurse@myclinicmd.com'
      
      if (isTestUser) {
        const { error } = await testSignIn(email, password)
        if (error) {
          setError(error.message)
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) {
          setError(error.message)
        }
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setIsSigningIn(false)
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800">
      <header className="bg-white/10 backdrop-blur-xl border-b border-white/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" viewBox="0 0 100 100" fill="currentColor">
                  <circle cx="58" cy="22" r="10" fill="none" stroke="currentColor" strokeWidth="4"/>
                  <path d="M25 50h20v30h10V50h20v-10h-20V20h-10v20h-20z" fill="currentColor"/>
                  <path d="M20 75 Q50 45 80 25" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">MyclinicMD</h1>
                <p className="text-xs text-blue-200">Electronic Medical Records</p>
              </div>
            </div>
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-white">
                    {user.user_metadata?.full_name || 'User'}
                  </p>
                  <p className="text-xs text-blue-200">{user.email}</p>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-semibold shadow-lg">
                  {(user.user_metadata?.full_name || user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl hover:bg-red-500/30 transition-all text-sm font-medium backdrop-blur-sm"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <LoadingSpinner message="Loading..." />
          </div>
        ) : user && role ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <LoadingSpinner message="Redirecting to dashboard..." />
          </div>
        ) : user && !role && !loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-3xl flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/50">
              <svg className="w-20 h-20 text-white" viewBox="0 0 100 100" fill="currentColor">
                <circle cx="58" cy="22" r="10" fill="none" stroke="currentColor" strokeWidth="4"/>
                <path d="M25 50h20v30h10V50h20v-10h-20V20h-10v20h-20z" fill="currentColor"/>
                <path d="M20 75 Q50 45 80 25" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Welcome to MyclinicMD</h2>
            <p className="text-blue-200 text-lg mb-8 max-w-md">
              Your account is being set up. Please contact your administrator to assign your role.
            </p>
            <button
              onClick={handleSignOut}
              className="px-6 py-3 bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl hover:bg-red-500/30 transition-all text-sm font-medium backdrop-blur-sm"
            >
              Sign Out
            </button>
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="w-full max-w-md">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-2xl mb-4 transform hover:scale-105 transition-transform">
                  <svg className="w-14 h-14 text-white" viewBox="0 0 100 100" fill="currentColor">
                    <circle cx="58" cy="22" r="10" fill="none" stroke="currentColor" strokeWidth="4"/>
                    <path d="M25 50h20v30h10V50h20v-10h-20V20h-10v20h-20z" fill="currentColor"/>
                    <path d="M20 75 Q50 45 80 25" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                  </svg>
                </div>
                <h2 className="text-4xl font-bold text-white mb-2 tracking-tight">Welcome to MyclinicMD</h2>
                <p className="text-blue-200 text-sm font-medium">Electronic Medical Records System</p>
                <p className="text-gray-400 text-xs mt-1">Secure • Reliable • Modern</p>
              </div>

              <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8">
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">Sign In</h3>
                  <p className="text-gray-300 text-sm">Enter your credentials to access your account</p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-semibold text-white/90">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                      </div>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={handleEmailChange}
                        onBlur={() => validateEmail(email)}
                        required
                        className={`w-full pl-12 pr-4 py-3 bg-white/10 border rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all backdrop-blur-sm ${emailError ? 'border-red-500/50' : 'border-white/20'}`}
                        placeholder="Enter your email"
                      />
                    </div>
                    {emailError && (
                      <p className="text-red-400 text-xs mt-1">{emailError}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-semibold text-white/90">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25h-10.5a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full pl-12 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all backdrop-blur-sm"
                        placeholder="Enter your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-white transition-colors z-10"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl text-sm flex items-center gap-2 backdrop-blur-sm">
                      <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSigningIn}
                    className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white py-3.5 rounded-xl font-semibold hover:from-blue-600 hover:to-cyan-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/50 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {isSigningIn ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Signing in...
                      </span>
                    ) : (
                      'Sign In'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
