'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { 
  Mail, 
  Lock, 
  ArrowRight, 
  Loader2, 
  Zap,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { validatePassword, passwordPolicy } from '@/lib/validation';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { login } = useAuth();

  const [showResetModal, setShowResetModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [tempUser, setTempUser] = useState<any>(null);

  const passwordValidation = validatePassword(newPassword);
  const isPasswordValid = passwordValidation.isValid && newPassword === confirmPassword;

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.endsWith('@10xds.com')) {
      setError('Only @10xds.com email addresses are allowed');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isLogin ? 'login' : 'signup',
          email,
          password
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (data.requiresPasswordReset) {
        setTempUser(data.user);
        setShowResetModal(true);
        setLoading(false);
        return;
      }

      // Save user to context & redirect
      login(data.user);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValidation.isValid) {
      setError('Password does not meet the policy requirements');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: tempUser.email,
          newPassword
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reset password');
      }

      // After reset, log them in
      login(tempUser);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResetLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] relative overflow-hidden font-sans">
      {/* Dynamic Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#6E3C96]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-500/5 blur-[120px] rounded-full" />
      
      <div className="w-full max-w-6xl px-6 grid lg:grid-cols-2 gap-16 items-center relative z-10">
        
        {/* Left Side: Branding & Info */}
        <div className="hidden lg:flex flex-col gap-10 animate-in fade-in slide-in-from-left duration-1000">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white border border-slate-200 w-fit shadow-sm">
            <div className="w-2 h-2 bg-brand rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Enterprise AI Portal</span>
          </div>
          
          <div className="space-y-6">
            <h1 className="text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
              Elevate Your <br />
              <span className="text-[#6E3C96]">Intelligence.</span>
            </h1>
            <p className="text-lg text-slate-500 leading-relaxed max-w-md">
              Securely manage, search, and chat with your corporate assets in a clean, professional environment.
            </p>
          </div>

          <div className="grid gap-5 max-w-sm">
            {[
              { icon: ShieldCheck, text: 'End-to-end encrypted storage', color: 'text-green-600', bg: 'bg-green-50' },
              { icon: Zap, text: 'Real-time AI document analysis', color: 'text-[#6E3C96]', bg: 'bg-[#6E3C96]/5' },
              { icon: CheckCircle2, text: 'Centralized knowledge repository', color: 'text-orange-600', bg: 'bg-orange-50' }
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-4 p-5 rounded-3xl bg-white border border-slate-100 shadow-sm hover:border-brand/20 hover:shadow-md transition-all group">
                <div className={`w-12 h-12 rounded-2xl ${feature.bg} flex items-center justify-center ${feature.color} group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-slate-700">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="w-full max-w-md mx-auto animate-in fade-in slide-in-from-right duration-1000">
          <div className="bg-white p-10 md:p-12 rounded-[48px] border border-slate-200 shadow-2xl shadow-slate-200/50 relative">
            <div className="mb-12 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-brand to-brand-dark rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-brand/20">
                <Zap className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900 mb-3">Welcome Back</h2>
              <p className="text-slate-400 text-sm font-medium">Access your enterprise knowledge base</p>
            </div>

            {error && (
              <div className="mb-8 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold animate-in shake duration-300">
                {error}
              </div>
            )}

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Username / Email</label>
                <div className="relative group">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-brand transition-colors" />
                  <input 
                    type="text" 
                    required
                    placeholder="admin_gtm"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4.5 pl-14 pr-5 text-slate-900 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-brand/10 focus:border-brand/50 transition-all placeholder:text-slate-300"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center ml-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-brand transition-colors" />
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4.5 pl-14 pr-5 text-slate-900 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-brand/10 focus:border-brand/50 transition-all placeholder:text-slate-300"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-brand hover:bg-brand-dark text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-brand/20 flex items-center justify-center gap-3 group mt-6 hover:-translate-y-1 active:translate-y-0"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span className="text-sm uppercase tracking-widest">Sign In</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white rounded-[40px] shadow-2xl p-10 md:p-12 border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <ShieldCheck className="w-8 h-8 text-orange-600" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-2">Secure Your Account</h2>
              <p className="text-slate-500 text-sm font-medium">Please create a permanent password to continue</p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">New Password</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-orange-500 transition-colors" />
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-14 pr-5 text-slate-900 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500/50 transition-all"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                {/* Password Requirements Checklist */}
                <div className="grid grid-cols-2 gap-2 px-2">
                  {[
                    { label: `Min ${passwordPolicy.minLength} chars`, met: newPassword.length >= passwordPolicy.minLength },
                    { label: 'Upper Case', met: passwordPolicy.hasUpperCase(newPassword) },
                    { label: 'Lower Case', met: passwordPolicy.hasLowerCase(newPassword) },
                    { label: 'Number', met: passwordPolicy.hasNumber(newPassword) },
                    { label: 'Special Char', met: passwordPolicy.hasSpecialChar(newPassword) },
                  ].map((req, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {req.met ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <div className="w-3 h-3 rounded-full border border-slate-200" />
                      )}
                      <span className={`text-[9px] font-bold uppercase tracking-tight ${req.met ? 'text-green-600' : 'text-slate-400'}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Confirm New Password</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-focus-within:text-orange-500 transition-colors" />
                  <input 
                    type="password" 
                    required
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-14 pr-5 text-slate-900 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500/50 transition-all"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-[9px] font-bold text-red-500 ml-2 uppercase">Passwords do not match</p>
                )}
              </div>

              <button 
                type="submit" 
                disabled={resetLoading || !isPasswordValid}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-black py-4.5 rounded-2xl transition-all shadow-xl shadow-orange-600/20 flex items-center justify-center gap-3 group disabled:opacity-30 disabled:cursor-not-allowed"
              >

                {resetLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span className="text-sm uppercase tracking-widest">Update & Sign In</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
