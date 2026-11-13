import { useState } from 'react';
import { AlertCircle, Camera, FileCheck2, Loader2, ShieldCheck } from 'lucide-react';
import { apiFetch, setAuthToken } from '../api';
import type { Language, UserDetails } from '../types';

interface AuthScreenProps {
  onAuthenticated: (user: UserDetails) => Promise<void>;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration state
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState<Language>('en');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to sign in.');
        return;
      }
      setAuthToken(data.token);
      await onAuthenticated(data.user);
    } catch {
      setErrorMsg('Network error while signing in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          email: regEmail,
          password: regPassword,
          phone,
          dateOfBirth,
          bloodGroup,
          emergencyContact,
          preferredLanguage,
          consentAccepted,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to create account.');
        return;
      }
      setAuthToken(data.token);
      await onAuthenticated(data.user);
    } catch {
      setErrorMsg('Network error while creating account.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoUser = (email: string) => {
    setMode('login');
    setLoginEmail(email);
    setLoginPassword('NidovaDemo2026!');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Nidova Health
          </span>
          <span className="text-xs text-slate-500 whitespace-nowrap">
            Patient Report Understanding &amp; Safety Workspace
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left informational column */}
        <div className="lg:col-span-6 space-y-6 pt-2">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 text-balance leading-tight">
              Understand your medical reports clearly, safely, and in your language.
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed max-w-xl">
              Upload laboratory reports, prescriptions, or discharge summaries from your files or
              capture them directly through your camera. Every numeric result is checked by
              deterministic safety rules before plain-language explanations are generated.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
            <div className="p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Deterministic Clinical Range Checks
                </h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Values are compared strictly against printed lab reference intervals. Missing
                  ranges are never assumed normal.
                </p>
              </div>
            </div>
            <div className="p-4 flex items-start gap-3">
              <Camera className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  File &amp; Live Camera Capture
                </h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Upload PDF, JPG, or PNG files or snap a paper report straight from your device
                  camera with automatic non-medical document screening.
                </p>
              </div>
            </div>
            <div className="p-4 flex items-start gap-3">
              <FileCheck2 className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Bilingual Summaries &amp; Audio Readout
                </h2>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  Switch between English and Kannada (ಕನ್ನಡ), adjust reading complexity, and listen
                  to report explanations.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-50/75 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 leading-relaxed">
            <span className="font-semibold">Medical Disclaimer:</span> Nidova Health provides
            informational explanations only. It does not diagnose medical conditions, prescribe
            treatments, or replace a qualified physician.
          </div>
        </div>

        {/* Right Login / Registration Card */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg(null);
              }}
              className={`py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setErrorMsg(null);
              }}
              className={`py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2.5 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{submitting ? 'Signing In...' : 'Sign In to Workspace'}</span>
              </button>

              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <p className="text-xs font-medium text-slate-600">
                  Demo accounts for instant workspace access:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemoUser('aarav.rao@example.com')}
                    className="text-left px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="font-semibold text-slate-900">Aarav Rao (Owner)</div>
                    <div className="text-slate-500 truncate">aarav.rao@example.com</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoUser('priya.rao@example.com')}
                    className="text-left px-3 py-2 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="font-semibold text-slate-900">Priya Rao (Family Viewer)</div>
                    <div className="text-slate-500 truncate">priya.rao@example.com</div>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Meera Nair"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="meera@example.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Password (min 8 chars)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98450 00000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Blood Group
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="">Select</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Language</label>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value as Language)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
                  >
                    <option value="en">English</option>
                    <option value="kn">ಕನ್ನಡ (Kannada)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Emergency Contact
                </label>
                <input
                  type="text"
                  value={emergencyContact}
                  onChange={(e) => setEmergencyContact(e.target.value)}
                  placeholder="Name and phone number"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>
                  I consent to private processing of my medical documents on Nidova Health and
                  understand this service is informational only and not a medical diagnosis.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{submitting ? 'Creating Account...' : 'Create Account & Continue'}</span>
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
