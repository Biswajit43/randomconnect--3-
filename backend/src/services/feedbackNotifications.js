export async function notifyFeedback({ category, message, createdAt }) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.FEEDBACK_NOTIFICATION_EMAIL;
  if (!apiKey || !recipient) return;

  const from = process.env.FEEDBACK_FROM_EMAIL || "RandomConnect <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: `[RandomConnect feedback] ${category}`,
      text: `Category: ${category}\nReceived: ${new Date(createdAt).toISOString()}\n\n${message}`,
    }),
  });
  if (!response.ok) throw new Error(`Feedback email failed with ${response.status}`);
}
