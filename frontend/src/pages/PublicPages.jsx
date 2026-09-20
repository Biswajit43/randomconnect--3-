import PublicLayout, { ActionLink, ContentSection } from "../components/PublicLayout.jsx";

const pageContent = {
  pricing: {
    eyebrow: "Simple by design",
    title: "Choose how you connect.",
    description: "The core RandomConnect experience stays open and easy to join. Premium adds room-hosting permissions and identity features without changing the way conversations work.",
    seoTitle: "Pricing | RandomConnect",
    seoDescription: "Explore RandomConnect access and Premium identity features.",
  },
  about: {
    eyebrow: "A different kind of social space",
    title: "Built for conversations, not performance.",
    description: "RandomConnect gives people a lightweight place to meet, talk, share interests, and leave without carrying a public profile everywhere.",
    seoTitle: "About RandomConnect",
    seoDescription: "Learn what RandomConnect is building and why the product keeps connection lightweight.",
  },
  contact: {
    eyebrow: "We are listening",
    title: "Need a hand or want to share an idea?",
    description: "For product feedback, safety concerns, and partnership questions, reach out through the channel that fits the conversation.",
    seoTitle: "Contact RandomConnect",
    seoDescription: "Contact RandomConnect about support, safety, feedback, or partnerships.",
  },
  faq: {
    eyebrow: "Answers before you join",
    title: "Questions, answered plainly.",
    description: "A few useful details about privacy, rooms, Premium, and staying in control while you talk.",
    seoTitle: "FAQ | RandomConnect",
    seoDescription: "Find answers about RandomConnect rooms, privacy, Premium, and safety.",
  },
  safety: {
    eyebrow: "Trust is a product feature",
    title: "Stay curious. Stay in control.",
    description: "Random conversations work best when boundaries are clear, reporting is easy, and leaving is always an option.",
    seoTitle: "Safety at RandomConnect",
    seoDescription: "Read the RandomConnect safety principles and learn how to report harmful behavior.",
  },
  privacy: {
    eyebrow: "Privacy overview",
    title: "Share less. Choose more.",
    description: "RandomConnect is designed around drop-in conversations, limited identity, and clear control over what you share.",
    seoTitle: "Privacy Policy | RandomConnect",
    seoDescription: "Read the RandomConnect privacy overview and understand what information the service uses.",
  },
  terms: {
    eyebrow: "The agreement",
    title: "The rules that keep the room usable.",
    description: "These terms set expectations for respectful participation and explain the limits of an anonymous communication service.",
    seoTitle: "Terms of Use | RandomConnect",
    seoDescription: "Read the RandomConnect terms of use and community participation rules.",
  },
};

export default function PublicPage({ kind }) {
  const content = pageContent[kind];
  return (
    <PublicLayout {...content}>
      {kind === "pricing" && <PricingContent />}
      {kind === "about" && <AboutContent />}
      {kind === "contact" && <ContactContent />}
      {kind === "faq" && <FaqContent />}
      {kind === "safety" && <SafetyContent />}
      {kind === "privacy" && <PrivacyContent />}
      {kind === "terms" && <TermsContent />}
    </PublicLayout>
  );
}

function PricingContent() {
  return <>
    <section className="public-card-grid" aria-label="Access options">
      <article className="public-card public-card-featured"><span className="card-kicker">Everyone</span><h2>Open access</h2><p>Join 1-to-1 conversations and live group rooms with no account or subscription.</p><ul><li>Random 1-to-1 matching</li><li>Voice and video rooms</li><li>Room chat and host controls</li><li>Leave or skip whenever you want</li></ul><ActionLink to="/rooms">Start talking</ActionLink></article>
      <article className="public-card"><span className="card-kicker">Premium</span><h2>More room control, still lightweight</h2><p>Premium currently adds the permissions already supported by the room service.</p><ul><li>Profile photo identity</li><li>Community rewards and badges</li><li>Moderate normal users in group rooms</li><li>Control shared room music and start mini-games</li><li>No access to private admin controls</li></ul><a href="mailto:hello@randomchats.me?subject=RandomConnect%20early%20access" className="button button-primary">Get early access</a></article>
    </section>
    <ContentSection title="No paywall around conversation"><p>RandomConnect does not put the basic ability to talk behind a subscription. Premium is an optional identity layer, not a requirement for joining the room.</p></ContentSection>
  </>;
}

function AboutContent() {
  return <><ContentSection title="A room with an exit"><p>Most social products ask you to build a persistent identity before you can participate. RandomConnect starts with the conversation and keeps your footprint small by default.</p></ContentSection><section className="public-card-grid"><article className="public-card"><span className="card-kicker">01</span><h2>Start lightly</h2><p>Choose a name and interests, then enter the part of the product that fits your mood.</p></article><article className="public-card"><span className="card-kicker">02</span><h2>Make space</h2><p>Mute, listen, share the room, and use host controls when a group needs help staying welcoming.</p></article><article className="public-card"><span className="card-kicker">03</span><h2>Leave cleanly</h2><p>Skip or leave without a feed to maintain and without a public profile following you around.</p></article></section><ContentSection title="What we are still building"><p>Safety, moderation, accessibility, and reliable communication deserve ongoing investment. The product is being shaped around those responsibilities, not added after the fact.</p><ActionLink to="/safety">Read the safety guide</ActionLink></ContentSection></>;
}

function ContactContent() {
  return <><section className="public-card-grid"><article className="public-card"><span className="card-kicker">Product</span><h2>Share feedback</h2><p>Ideas and bug reports can be sent from the in-app Guide so the team has the room context it needs.</p><ActionLink to="/guide">Open the Guide</ActionLink></article><article className="public-card"><span className="card-kicker">Safety</span><h2>Report a real concern</h2><p>Use the report action inside a live conversation. It ends the session and sends the relevant details for review.</p><ActionLink to="/safety">Safety information</ActionLink></article><article className="public-card"><span className="card-kicker">Partnerships</span><h2>Start a conversation</h2><p>For partnerships or accessibility feedback, email the team at <a href="mailto:hello@randomchats.me">hello@randomchats.me</a>.</p></article></section><ContentSection title="Please do not send secrets"><p>Never include passwords, recovery codes, private keys, or sensitive personal information in feedback or email.</p></ContentSection></>;
}

function FaqContent() {
  const questions = [["Do I need an account?", "No. You choose a display name on this device and can enter without an email or phone number."], ["Can I turn my camera off?", "Yes. Camera starts off and is only requested when you choose to turn it on. Microphone controls are always available during a call."], ["What happens when I leave?", "Your active room session ends. One-to-one messages are session-only, and you can leave or skip at any time."], ["How do group rooms work?", "Rooms are live voice or video spaces with a host, room chat, participant controls, shared music, and optional games."], ["How do I report someone?", "Use Report during a one-to-one call or inside a group room. Leave immediately if you feel unsafe."], ["What is Premium?", "Premium adds optional identity features such as a profile photo and community rewards. It is not required to use the core product."]];
  return <section className="faq-list">{questions.map(([question, answer]) => <details key={question} className="faq-item"><summary>{question}</summary><p>{answer}</p></details>)}</section>;
}

function SafetyContent() {
  return <><section className="public-card-grid"><article className="public-card"><span className="card-kicker">Your controls</span><h2>Mute, skip, leave</h2><p>You never owe a stranger more time, attention, or access. Use the controls early when a conversation is not right for you.</p></article><article className="public-card"><span className="card-kicker">Room culture</span><h2>Keep it human</h2><p>No sexual content, threats, hate, harassment, doxxing, or attempts to involve minors. Hosts can moderate their rooms.</p></article><article className="public-card"><span className="card-kicker">When it crosses a line</span><h2>Report and exit</h2><p>Report credible safety issues through the active call. Do not negotiate with someone who is threatening or harassing you.</p></article></section><ContentSection title="For urgent danger"><p>RandomConnect is not an emergency service. If you are in immediate danger, contact local emergency services or a trusted person.</p></ContentSection></>;
}

function PrivacyContent() {
  return <><ContentSection title="What the product uses"><p>The service uses a device-generated identifier, display name, connection metadata, and room activity to provide matching, presence, moderation, and abuse prevention. One-to-one media is peer-to-peer or TURN-relayed; it is not stored as a recording by the application.</p></ContentSection><ContentSection title="What you control"><p>You can leave a room, skip a match, remove your local identity from the device, and choose whether to enable your camera. Do not share information in a room that you would not want another participant to retain.</p></ContentSection><ContentSection title="Reports and safety records"><p>Reports, bans, and moderation records may be retained to protect the community and review abuse. Access is restricted to staff workflows. Contact the team if you have a privacy question.</p></ContentSection></>;
}

function TermsContent() {
  return <><ContentSection title="Use the service responsibly"><p>You must be at least 18, follow the room rules, respect other participants, and avoid illegal, abusive, deceptive, or harmful behavior.</p></ContentSection><ContentSection title="No guarantee of stranger behavior"><p>RandomConnect provides tools for communication and moderation, but no online service can guarantee that every participant will behave appropriately. Keep control of your boundaries and leave when needed.</p></ContentSection><ContentSection title="Enforcement"><p>We may remove content, end sessions, restrict devices, or close rooms when behavior violates the rules or threatens the community. Serious issues may be escalated to appropriate authorities where required.</p></ContentSection></>;
}
