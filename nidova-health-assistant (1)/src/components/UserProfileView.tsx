import { useState } from 'react';
import { CheckCircle2, Loader2, LogOut, UserCheck } from 'lucide-react';
import { apiFetch } from '../api';
import type { AuditLog, Language, ReadingLevel, UserDetails } from '../types';
import { AuditView } from './AuditView';

interface UserProfileViewProps {
  user: UserDetails;
  auditLogs: AuditLog[];
  rulesVersion: string;
  onUpdated: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function UserProfileView({
  user,
  auditLogs,
  rulesVersion,
  onUpdated,
  onLogout,
}: UserProfileViewProps) {
  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth);
  const [bloodGroup, setBloodGroup] = useState(user.bloodGroup);
  const [emergencyContact, setEmergencyContact] = useState(user.emergencyContact);
  const [preferredLanguage, setPreferredLanguage] = useState<Language>(user.preferredLanguage);
  const [readingLevel, setReadingLevel] = useState<ReadingLevel>(user.readingLevel);

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      const res = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          phone,
          dateOfBirth,
          bloodGroup,
          emergencyContact,
          preferredLanguage,
          readingLevel,
        }),
      });
      if (res.ok) {
        setSavedNotice(true);
        await onUpdated();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* User Summary & Logout Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-800 font-semibold text-base shrink-0">
            {user.fullName
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{user.fullName}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span>{user.email}</span>
              {user.bloodGroup && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">Blood Group: {user.bloodGroup}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Last login: {new Date(user.lastLoginAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* User Account Details Form & Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSave}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="border-b border-slate-200 pb-3">
            <h2 className="text-base font-semibold text-slate-900">Personal &amp; Health Details</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Update your personal contact details, emergency contact, and explanation preferences
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 ..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Blood Group</label>
              <select
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="">Not specified</option>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Summary Language
              </label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as Language)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="en">English</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Reading Level
              </label>
              <select
                value={readingLevel}
                onChange={(e) => setReadingLevel(e.target.value as ReadingLevel)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                <option value="basic">Basic</option>
                <option value="standard">Standard</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-2">
            {savedNotice ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                <span>User details saved</span>
              </span>
            ) : (
              <span />
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{saving ? 'Saving...' : 'Save Details'}</span>
            </button>
          </div>
        </form>

        {/* Consent & Security Metadata */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserCheck className="w-4 h-4 text-teal-700" />
            <span>Account &amp; Consent Record</span>
          </div>
          <dl className="divide-y divide-slate-200 text-xs">
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Account ID</dt>
              <dd className="font-mono text-slate-800">{user.id}</dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Privacy Consent</dt>
              <dd className="font-medium text-emerald-700">
                {user.consentAccepted ? 'Accepted' : 'Pending'}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Consent Timestamp</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {new Date(user.consentTimestamp).toLocaleDateString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Member Since</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {new Date(user.createdAt).toLocaleDateString()}
              </dd>
            </div>
            <div className="py-2.5 flex justify-between gap-4">
              <dt className="text-slate-500">Last Authenticated</dt>
              <dd className="font-mono tabular-nums text-slate-800">
                {new Date(user.lastLoginAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Embedded Security & Clinical Audit Log */}
      <AuditView logs={auditLogs} rulesVersion={rulesVersion} />
    </div>
  );
}
