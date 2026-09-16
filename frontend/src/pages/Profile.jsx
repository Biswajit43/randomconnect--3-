import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { getDisplayName, getFingerprint } from "../lib/socket.js";

function daysLeft(expiresAt) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

export default function Profile() {
  const navigate = useNavigate();
  const [premium, setPremium] = useState(null);
  const [community, setCommunity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getDisplayName()) {
      navigate("/", { replace: true });
      return;
    }
    const fingerprint = getFingerprint();
    Promise.all([api.premiumStatus(fingerprint), api.communityStatus(fingerprint)])
      .then(([premiumStatus, communityStatus]) => {
        setPremium(premiumStatus);
        setCommunity(communityStatus);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const remaining = useMemo(() => daysLeft(premium?.expiresAt), [premium?.expiresAt]);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 md:px-10">
      <div className="mx-auto max-w-2xl">
        <button onClick={() => navigate("/rooms")} className="text-sm text-mist hover:text-white">← Back to rooms</button>
        <header className="mt-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-violet">Private profile</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-white">Your rewards</h1>
          <p className="mt-2 text-sm text-mist">Only you can see your Premium time and community progress here.</p>
        </header>

        {loading ? <div className="mt-6 h-40 animate-pulse rounded-2xl border border-white/10 bg-panel/60" aria-label="Loading profile" /> : (
          <section className="mt-6 space-y-4">
            <article className="rounded-2xl border border-violet/30 bg-panel/80 p-5 surface-lift">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs uppercase tracking-wider text-violet">Premium status</p><h2 className="mt-1 font-display text-xl font-semibold text-white">{premium?.active ? "Premium active" : "No active Premium"}</h2></div>
                <span className="rounded-full bg-violet/15 px-3 py-1 text-xs font-semibold text-violet">{premium?.active ? `${remaining} day${remaining === 1 ? "" : "s"} left` : "Invite to unlock"}</span>
              </div>
              <p className="mt-3 text-sm text-mist">Every successful friend redemption adds another 30 days to your current Premium time.</p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-panel/80 p-5">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-signal2">Community level</p><h2 className="mt-1 font-display text-xl font-semibold text-white">{community?.level?.badge} {community?.level?.name || "New Connector"}</h2></div><span className="text-sm text-mist">{community?.successfulReferrals || 0} successful invite{community?.successfulReferrals === 1 ? "" : "s"}</span></div>
              {community && <><div className="mt-4 h-2 overflow-hidden rounded-full bg-black/25"><div className="h-full rounded-full bg-violet transition-all" style={{ width: `${Math.round(community.progress * 100)}%` }} /></div><p className="mt-2 text-xs text-mist">{community.nextLevel ? `${community.nextLevel.min - community.successfulReferrals} more successful invite${community.nextLevel.min - community.successfulReferrals === 1 ? "" : "s"} to reach ${community.nextLevel.name}.` : "You reached the top community level."}</p></>}
            </article>
          </section>
        )}
      </div>
    </main>
  );
}
