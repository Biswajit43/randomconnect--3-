import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { getAvatarUrl, getDisplayName, getFingerprint, setAvatarUrl } from "../lib/socket.js";

function daysLeft(expiresAt) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
}

export default function Profile() {
  const navigate = useNavigate();
  const [premium, setPremium] = useState(null);
  const [community, setCommunity] = useState(null);
  const [avatar, setAvatar] = useState(() => getAvatarUrl());
  const [avatarMessage, setAvatarMessage] = useState("");
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

  async function updateAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!premium?.active) { setAvatarMessage("Profile photos are a Premium feature. Invite a friend to unlock it."); return; }
    if (!file.type.startsWith("image/")) { setAvatarMessage("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarMessage("Please choose an image under 5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const edge = 256;
        const canvas = document.createElement("canvas");
        canvas.width = edge; canvas.height = edge;
        const context = canvas.getContext("2d");
        const scale = Math.max(edge / image.width, edge / image.height);
        const width = image.width * scale; const height = image.height * scale;
        context.drawImage(image, (edge - width) / 2, (edge - height) / 2, width, height);
        const nextAvatar = canvas.toDataURL("image/jpeg", 0.78);
        setAvatarUrl(nextAvatar); setAvatar(nextAvatar); setAvatarMessage("Profile photo saved. Rejoin a room to show it there.");
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function removeAvatar() {
    setAvatarUrl(""); setAvatar(""); setAvatarMessage("Profile photo removed.");
  }

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
              <div className="flex items-center gap-4">
                {avatar ? <img src={avatar} alt="Your profile" className="h-16 w-16 rounded-full object-cover border-2 border-violet/50" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-panel2 text-2xl text-violet">{getDisplayName().slice(0, 1).toUpperCase()}</div>}
                <div><p className="text-xs uppercase tracking-wider text-violet">Premium profile identity</p><h2 className="mt-1 font-display text-lg font-semibold text-white">{getDisplayName()}</h2><p className="mt-1 text-xs text-mist">Your photo is shared only with people in your active room.</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <label className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold ${premium?.active ? "bg-violet text-ink hover:brightness-110" : "border border-white/10 text-mist"}`}>
                  {premium?.active ? "Upload profile photo" : "Premium photo feature"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={updateAvatar} className="sr-only" />
                </label>
                {avatar && <button onClick={removeAvatar} className="rounded-lg border border-coral/30 px-3 py-2 text-xs text-coral hover:bg-coral/10">Remove photo</button>}
              </div>
              {avatarMessage && <p className="mt-2 text-xs text-signal2">{avatarMessage}</p>}
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
