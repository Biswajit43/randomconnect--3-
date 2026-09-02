import { useState } from "react";

const REASONS = [
  { value: "nudity_sexual_content", label: "Nudity or sexual content" },
  { value: "minor_endangerment", label: "I believe this person is a minor" },
  { value: "harassment_abuse", label: "Harassment or abuse" },
  { value: "violence_graphic", label: "Violence or graphic content" },
  { value: "spam_scam", label: "Spam or scam" },
  { value: "other", label: "Something else" },
];

export default function ReportModal({ open, onClose, onSubmit }) {
  const [reason, setReason] = useState(REASONS[0].value);
  const [details, setDetails] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-panel rounded-2xl border border-white/10 p-6">
        <h3 className="font-display text-lg font-semibold text-white mb-1">Report this person</h3>
        <p className="text-sm text-mist mb-4">
          This ends the session immediately. Reports involving minors are prioritized and, where
          required by law, referred to the relevant authorities.
        </p>

        <div className="space-y-2 mb-4">
          {REASONS.map((r) => (
            <label
              key={r.value}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                reason === r.value ? "border-signal bg-signal/10 text-white" : "border-white/10 text-mist"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-signal"
              />
              {r.label}
            </label>
          ))}
        </div>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Optional details that help moderators (no personal info needed)"
          maxLength={1000}
          rows={3}
          className="w-full bg-panel2 rounded-lg px-3 py-2 text-sm text-white placeholder:text-mist/50 outline-none focus-visible:outline-signal mb-4"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-mist hover:text-white">
            Cancel
          </button>
          <button
            onClick={() => onSubmit({ reason, details })}
            className="px-4 py-2 rounded-lg bg-coral text-ink text-sm font-semibold hover:brightness-110"
          >
            Submit report
          </button>
        </div>
      </div>
    </div>
  );
}
