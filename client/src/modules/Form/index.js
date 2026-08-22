import { useEffect, useMemo, useState } from "react";
import Button from "../../components/Button";
import Input from "../../components/input";
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://chatterflow.onrender.com';

const Form = ({ isSignInPage = false }) => {
  const [data, setData] = useState({
    ...(!isSignInPage && { fullName: '' }),
    email: '',
    password: '',
  });
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otp, setOtp] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);
  const [expiryCountdown, setExpiryCountdown] = useState(300);
  const [otpError, setOtpError] = useState('');

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(() => {
    const storedTheme = localStorage.getItem('chatterflow-theme');
    return storedTheme ? storedTheme === 'dark' : false;
  });

  const navigate = useNavigate();

  // Reset OTP step when switching between Sign In and Sign Up
  useEffect(() => {
    setIsOtpStep(false);
    setOtp('');
    setOtpError('');
    setToast(null);
  }, [isSignInPage]);

  useEffect(() => {
    document.body.classList.toggle('dark', darkMode);
    localStorage.setItem('chatterflow-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  // Timers for OTP step: Resend cooldown and OTP expiration countdown
  useEffect(() => {
    if (!isOtpStep) return undefined;

    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setExpiryCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOtpStep]);

  const headingText = useMemo(() => {
    if (isSignInPage) return 'Welcome back';
    if (isOtpStep) return 'Verify your email';
    return 'Welcome aboard';
  }, [isSignInPage, isOtpStep]);

  const subheadingText = useMemo(() => {
    if (isSignInPage) return 'Sign in to continue your conversation';
    if (isOtpStep) return 'Enter the 6-digit verification code sent to your email';
    return 'Create your account and start chatting';
  }, [isSignInPage, isOtpStep]);

  const formatExpiryTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleRegisterOrLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setToast(null);
    setOtpError('');

    try {
      const endpoint = isSignInPage ? `${API_BASE_URL}/api/login` : `${API_BASE_URL}/api/register`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok) {
        if (isSignInPage) {
          if (resData.token) {
            localStorage.setItem('user:token', resData.token);
            localStorage.setItem('user:detail', JSON.stringify(resData.user));
            navigate('/');
          } else {
            setToast({ type: 'error', message: 'Login failed: token missing.' });
          }
          return;
        }

        // Signup flow
        if (resData.requiresEmailVerification) {
          setVerificationEmail(resData.email || data.email);
          setIsOtpStep(true);
          setOtp('');
          setOtpError('');
          setResendCooldown(60);
          setExpiryCountdown(300);
          setToast({
            type: 'success',
            message: resData.message || 'Verification code sent to your email.',
          });
          return;
        }

        if (resData.token) {
          localStorage.setItem('user:token', resData.token);
          localStorage.setItem('user:detail', JSON.stringify(resData.user));
          navigate('/');
          return;
        }

        // Fallback for successful registration without token
        setToast({ type: 'success', message: 'Registration successful. Please log in.' });
        navigate('/users/sign_in');
        return;
      }

      // Handle non-OK status
      if (res.status === 403 && resData.requiresEmailVerification) {
        setVerificationEmail(data.email);
        setIsOtpStep(true);
        setOtp('');
        setOtpError('');
        setResendCooldown(60);
        setExpiryCountdown(300);
        setToast({
          type: 'error',
          message: 'Please verify your email before logging in.',
        });
        return;
      }

      const message = resData?.error || 'Something went wrong. Please try again.';
      setToast({ type: 'error', message });
    } catch (error) {
      setToast({ type: 'error', message: 'Unable to reach the server right now. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpError('');

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setOtpError('Please enter a valid 6-digit verification code.');
      return;
    }

    if (expiryCountdown === 0) {
      setOtpError('Your verification code has expired. Please request a new one.');
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: verificationEmail || data.email,
          otp: cleanOtp,
          purpose: 'signup',
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok) {
        setToast({
          type: 'success',
          message: resData.message || 'Email verified successfully! You can now log in.',
        });
        // Success: Redirect to login page
        setTimeout(() => {
          navigate('/users/sign_in');
        }, 1200);
        return;
      }

      const message = resData?.error || 'Verification failed. Please try again.';
      setOtpError(message);
      setToast({ type: 'error', message });
    } catch (error) {
      const message = 'Unable to reach the server right now. Please check your connection and try again.';
      setOtpError(message);
      setToast({ type: 'error', message });
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;

    setResending(true);
    setOtpError('');
    setToast(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: verificationEmail || data.email,
          purpose: 'signup',
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (res.ok) {
        setResendCooldown(60);
        setExpiryCountdown(300);
        setOtp('');
        setToast({
          type: 'success',
          message: resData.message || 'A new verification code has been sent to your email.',
        });
        return;
      }

      const message = resData?.error || 'Failed to resend verification code. Please try again.';
      setOtpError(message);
      setToast({ type: 'error', message });
    } catch (error) {
      const message = 'Unable to reach the server right now. Please try again.';
      setOtpError(message);
      setToast({ type: 'error', message });
    } finally {
      setResending(false);
    }
  };

  const handleBackToSignup = () => {
    setIsOtpStep(false);
    setOtp('');
    setOtpError('');
    setToast(null);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.18),_transparent_35%),linear-gradient(135deg,#f5f3ff_0%,#eef2ff_100%)] transition-colors duration-300 dark:bg-[radial-gradient(circle_at_top,_rgba(91,33,182,0.28),_transparent_40%),linear-gradient(135deg,#020817_0%,#0f172a_100%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-[32px] border border-white/40 bg-white/75 shadow-soft backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
          <div className="grid md:grid-cols-[1.1fr_0.9fr]">
            <div className="relative hidden overflow-hidden bg-gradient-to-br from-violet-700 via-indigo-700 to-purple-900 p-10 text-white md:flex md:flex-col md:justify-between">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.18),_transparent_35%)]" />
              <div className="relative z-10">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-violet-100">
                  ChatterFlow
                </div>
                <h1 className="max-w-xs text-4xl font-semibold leading-tight">Professional messaging for modern teams.</h1>
              </div>

              <div className="relative z-10 space-y-5">
                <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm">
                  <p className="text-lg font-medium">Stay synced in real time</p>
                  <p className="mt-2 text-sm text-violet-100/90">Connect instantly, share ideas quickly, and keep every conversation moving.</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-violet-100">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">✓</span>
                  Safe account access
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-8 lg:p-12">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-400">
                    {isOtpStep ? 'Security' : 'Access'}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold text-slate-800 dark:text-white">{headingText}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Toggle color mode"
                  onClick={() => setDarkMode((prev) => !prev)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {darkMode ? '☀️' : '🌙'}
                </button>
              </div>

              <p className="mb-8 text-base text-slate-600 dark:text-slate-300">
                {subheadingText}
              </p>

              {isOtpStep ? (
                /* OTP Verification Step */
                <form className="space-y-5" onSubmit={handleVerifyOtp}>
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-900/40 dark:bg-violet-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                      Verifying Account
                    </p>
                    <p className="mt-1 break-all text-sm font-medium text-slate-800 dark:text-slate-200">
                      {verificationEmail || data.email}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="otp"
                      className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200"
                    >
                      Enter 6-Digit Code
                    </label>
                    <input
                      id="otp"
                      name="otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setOtp(cleaned);
                        if (otpError) setOtpError('');
                      }}
                      placeholder="••••••"
                      className="block w-full rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-center font-mono text-2xl font-semibold tracking-[0.4em] text-slate-800 shadow-sm transition duration-200 placeholder:tracking-normal placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-100 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
                      autoFocus
                    />
                  </div>

                  {otpError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-950/50 dark:text-red-300">
                      {otpError}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <div>
                      {expiryCountdown > 0 ? (
                        <span>
                          Code expires in <strong className="font-semibold text-slate-700 dark:text-slate-200">{formatExpiryTime(expiryCountdown)}</strong>
                        </span>
                      ) : (
                        <span className="font-semibold text-red-600 dark:text-red-400">
                          Code expired
                        </span>
                      )}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCooldown > 0 || resending}
                        className="font-medium text-violet-600 transition hover:text-violet-500 disabled:cursor-not-allowed disabled:text-slate-400 dark:text-violet-400 dark:disabled:text-slate-600"
                      >
                        {resending
                          ? 'Sending...'
                          : resendCooldown > 0
                          ? `Resend code in ${resendCooldown}s`
                          : 'Resend code'}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    label={loading ? 'Verifying code...' : 'Verify & Complete Signup'}
                    className="mt-2 w-full"
                    disabled={loading || otp.length !== 6 || expiryCountdown === 0}
                  />

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={handleBackToSignup}
                      className="text-xs font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                    >
                      ← Back to change email or details
                    </button>
                  </div>
                </form>
              ) : (
                /* Standard Login or Registration Form */
                <form className="space-y-5" onSubmit={handleRegisterOrLogin}>
                  {!isSignInPage && (
                    <Input
                      label="Full name"
                      name="fullName"
                      placeholder="Enter your full name"
                      value={data.fullName}
                      autoComplete="name"
                      onChange={(e) => setData({ ...data, fullName: e.target.value })}
                    />
                  )}

                  <Input
                    label="Email address"
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    value={data.email}
                    autoComplete="email"
                    onChange={(e) => setData({ ...data, email: e.target.value })}
                  />

                  <Input
                    label="Password"
                    name="password"
                    placeholder="Enter your password"
                    type="password"
                    value={data.password}
                    autoComplete={isSignInPage ? 'current-password' : 'new-password'}
                    onChange={(e) => setData({ ...data, password: e.target.value })}
                  />

                  <Button
                    type="submit"
                    label={
                      loading
                        ? isSignInPage
                          ? 'Signing in...'
                          : 'Creating account...'
                        : isSignInPage
                        ? 'Log in'
                        : 'Create account'
                    }
                    className="mt-2 w-full"
                    disabled={loading}
                  />
                </form>
              )}

              {!isOtpStep && (
                <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <span>{isSignInPage ? "Don't have an account?" : 'Already have an account?'}</span>
                  <button
                    type="button"
                    onClick={() => navigate(`/users/${isSignInPage ? 'sign_up' : 'sign_in'}`)}
                    className="font-semibold text-violet-600 transition hover:text-violet-500 dark:text-violet-400"
                  >
                    {isSignInPage ? 'Sign up' : 'Log in'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-fade-in-up">
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl ${
              toast.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-950/70 dark:text-red-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/70 dark:text-emerald-200'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default Form;
