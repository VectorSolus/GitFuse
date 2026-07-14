"use client";

import { useState } from "react";
import { AlertTriangle, Camera, Copy, Mail, ShieldAlert, Key as KeyIcon, CheckCircle2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function ProfileSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text mb-1">Profile Settings</h2>
        <p className="text-text-3">Manage your personal information and avatar.</p>
      </div>

      <div className="bg-surface border border-surface-2 rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-6">
          <div className="relative group cursor-pointer">
            <div className="w-20 h-20 bg-ocean text-white rounded-full flex items-center justify-center text-2xl font-bold">
              GF
            </div>
            <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-text">Avatar</h3>
            <p className="text-sm text-text-3">Click to upload a new avatar (max 2MB).</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-2 mb-1.5">Display Name</label>
            <input type="text" defaultValue="GitFuse User" className="w-full bg-background border border-surface-2 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-ocean transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-2 mb-1.5">Email</label>
            <input type="email" defaultValue="user@gitfuse.dev" disabled className="w-full bg-background border border-surface-2 rounded-lg px-3 py-2 text-text-3 cursor-not-allowed opacity-70" />
            <p className="text-xs text-text-3 mt-1">Sourced from GitHub OAuth.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-2 mb-1.5">Bio <span className="text-text-3 font-normal">(Optional)</span></label>
            <textarea rows={3} placeholder="A short bio about yourself..." className="w-full bg-background border border-surface-2 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-ocean transition-colors" />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-2 mb-1.5">Website URL <span className="text-text-3 font-normal">(Optional)</span></label>
            <input type="url" placeholder="https://" className="w-full bg-background border border-surface-2 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-ocean transition-colors" />
          </div>
        </div>

        <div className="pt-4 border-t border-surface-2 flex justify-end">
          <button className="bg-ocean hover:bg-ocean-light text-white font-medium py-2 px-6 rounded-lg transition-colors">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

export function SecuritySection() {
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  return (
    <div className="space-y-6 relative">
      <div>
        <h2 className="text-2xl font-bold text-text mb-1">Security & Auth</h2>
        <p className="text-text-3">Manage two-factor authentication and connected accounts.</p>
      </div>

      <div className="bg-surface border border-surface-2 rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-semibold text-text mb-4">Two-Factor Authentication (2FA)</h3>
          <div className="flex items-center justify-between p-4 bg-background border border-amber-500/30 rounded-lg">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <div>
                <div className="font-medium text-amber-500">Not configured</div>
                <p className="text-sm text-text-3">Add an extra layer of security to your account.</p>
              </div>
            </div>
            <button
              onClick={() => showToast("Two-factor authentication is planned for v1.5. We'll notify you when it's ready.")}
              className="border border-surface-2 hover:bg-surface-2 text-text font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Enable 2FA
            </button>
          </div>
        </div>

        <div className="pt-6 border-t border-surface-2">
          <h3 className="font-semibold text-text mb-4">Connected accounts</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-background border border-surface-2 rounded-lg">
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden="true">
                  <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 .1.8 2.1 3.4 1.5.1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.1 5.9 18 6.2 18 6.2c.6 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v2.6c0 .4.2.7.8.6A12 12 0 0 0 12 .5Z" />
                </svg>
                <div>
                  <div className="font-medium text-text">GitHub</div>
                  <p className="text-sm text-text-3">gitfuse-user</p>
                </div>
              </div>
              <div className="bg-ocean/10 text-ocean text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-background border border-surface-2 rounded-lg">
              <div className="flex items-center gap-3 opacity-60">
                <Mail className="w-5 h-5 text-text" />
                <div>
                  <div className="font-medium text-text">Google</div>
                  <p className="text-sm text-text-3">Connect your Google account</p>
                </div>
              </div>
              <button
                onClick={() => showToast("Google sign-in coming in v1.5")}
                className="border border-surface-2 hover:bg-surface-2 text-text-2 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Add Google account
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#0F172A] text-white px-4 py-3 rounded-lg shadow-xl border border-surface-2 font-medium z-50 animate-in fade-in slide-in-from-bottom-4 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  );
}

export function ApiKeysSection() {
  const [showModal, setShowModal] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const handleGenerate = () => {
    setGeneratedKey("gf_live_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text mb-1">Personal API Keys</h2>
        <p className="text-text-3">Use API keys to grant external tools access to specific repos.</p>
        <div className="bg-ocean/10 border border-ocean/20 text-ocean-light text-sm p-3 rounded-lg mt-4 inline-block">
          Note: Repo-scoped keys ship in v1.5. Current keys grant read access to all repos.
        </div>
      </div>

      <div className="bg-surface border border-surface-2 rounded-xl p-6">
        {generatedKey ? (
          <div className="bg-background border border-surface-2 rounded-lg p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-lg text-text">New API Key Generated</h3>
            <p className="text-text-3 text-sm text-amber-500 bg-amber-500/10 py-2 px-4 rounded-lg inline-block">
              Store this key securely. It will not be shown again.
            </p>
            <div className="flex items-center gap-2 max-w-md mx-auto mt-4">
              <input type="text" readOnly value={generatedKey} className="flex-1 bg-surface border border-surface-2 rounded-lg px-3 py-2 text-text font-mono text-sm focus:outline-none" />
              <button
                onClick={() => navigator.clipboard.writeText(generatedKey)}
                className="bg-surface-2 hover:bg-surface-2/80 text-text p-2 rounded-lg transition-colors border border-surface-2"
                title="Copy to clipboard"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
            <div className="pt-4">
              <button
                onClick={() => setGeneratedKey(null)}
                className="text-ocean hover:text-ocean-light text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <KeyIcon className="w-12 h-12 text-surface-2 mx-auto mb-4" />
            <h3 className="font-medium text-text mb-1">No API keys yet</h3>
            <p className="text-text-3 text-sm mb-6">Create a key to access gitfuse from other services.</p>

            {showModal ? (
              <div className="max-w-sm mx-auto bg-background border border-surface-2 p-6 rounded-xl text-left space-y-4">
                <h3 className="font-semibold text-text">Generate New Key</h3>
                <div>
                  <label className="block text-sm font-medium text-text-2 mb-1">Name</label>
                  <input type="text" placeholder="e.g. CI Server" className="w-full bg-surface border border-surface-2 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-ocean text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-2 mb-1">Expiry</label>
                  <select className="w-full bg-surface border border-surface-2 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-ocean text-sm">
                    <option>30 days</option>
                    <option>90 days</option>
                    <option>Never</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowModal(false)} className="flex-1 border border-surface-2 hover:bg-surface-2 text-text py-2 rounded-lg transition-colors text-sm font-medium">Cancel</button>
                  <button onClick={() => { handleGenerate(); setShowModal(false); }} className="flex-1 bg-ocean hover:bg-ocean-light text-white py-2 rounded-lg transition-colors text-sm font-medium">Generate</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                className="bg-ocean hover:bg-ocean-light text-white font-medium py-2 px-6 rounded-lg transition-colors"
              >
                Generate key
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function NotificationsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text mb-1">Notifications</h2>
        <p className="text-text-3">Manage when and how we contact you.</p>
      </div>

      <div className="bg-surface border border-surface-2 rounded-xl overflow-hidden divide-y divide-surface-2">
        <div className="flex items-center justify-between p-6">
          <div>
            <h3 className="font-semibold text-text mb-1">Sync history expiry warnings</h3>
            <p className="text-sm text-text-3 max-w-md">Receive an email when your sync history is approaching the 30-day retention limit.</p>
          </div>
          <Switch defaultChecked />
        </div>

        <div className="flex items-center justify-between p-6">
          <div>
            <h3 className="font-semibold text-text mb-1">New device registrations</h3>
            <p className="text-sm text-text-3 max-w-md">Receive an email whenever a new device is approved for your account.</p>
          </div>
          <Switch defaultChecked />
        </div>

        <div className="flex items-center justify-between p-6">
          <div>
            <h3 className="font-semibold text-text mb-1">Product updates</h3>
            <p className="text-sm text-text-3 max-w-md">Receive occasional emails about new features and changelogs.</p>
          </div>
          <Switch />
        </div>

        <div className="p-6 bg-background flex justify-end">
          <button className="bg-ocean hover:bg-ocean-light text-white font-medium py-2 px-6 rounded-lg transition-colors">
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}

export function DangerZoneSection() {
  const [confirmText, setConfirmText] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-red-400 mb-1">Danger Zone</h2>
        <p className="text-text-3">Irreversible and destructive actions.</p>
      </div>

      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6">
        <h3 className="font-semibold text-text mb-2">Delete Account</h3>
        <p className="text-sm text-text-3 max-w-xl mb-6">
          Once you delete your account, there is no going back. Please be certain.
        </p>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="border border-red-500/50 hover:bg-red-500/10 text-red-400 font-medium py-2 px-6 rounded-lg transition-colors">
              Delete account
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-surface border-surface-2 text-text">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your gitfuse account</AlertDialogTitle>
              <AlertDialogDescription className="text-text-3">
                This removes your relay entries, bundles, and dashboard access. Your local git history is not affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4 space-y-2">
              <label className="text-sm font-medium text-text-2">Type "delete" to confirm</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="w-full bg-background border border-surface-2 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-red-500 transition-colors"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-transparent border-surface-2 text-text hover:bg-surface-2 hover:text-text">Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText !== "delete"}
                className="bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  // Server action placeholder
                  alert("Account deleted!");
                }}
              >
                Delete Account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
