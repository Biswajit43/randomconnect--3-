import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

const primaryLinks = [
  ["/rooms", "Rooms"],
  ["/pricing", "Pricing"],
  ["/guide", "Guide"],
];

const companyLinks = [
  ["/about", "About"],
  ["/contact", "Contact"],
  ["/faq", "FAQ"],
  ["/safety", "Safety"],
];

const legalLinks = [
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
];

export function Brand({ light = false }) {
  return (
    <Link to="/" className={`brand-mark ${light ? "text-white" : ""}`} aria-label="RandomConnect home">
      random<span>connect</span>
    </Link>
  );
}

export default function PublicLayout({ children, eyebrow, title, description, seoTitle, seoDescription, canonical, compact = false }) {
  const location = useLocation();

  useEffect(() => {
    document.title = seoTitle || `${title} | RandomConnect`;
    const descriptionTag = document.querySelector('meta[name="description"]');
    if (descriptionTag) descriptionTag.setAttribute("content", seoDescription || description);
    const canonicalTag = document.querySelector('link[rel="canonical"]');
    if (canonicalTag) canonicalTag.setAttribute("href", canonical || `https://randomchats.me${location.pathname}`);
  }, [canonical, description, location.pathname, seoDescription, seoTitle, title]);

  return (
    <div className="public-site min-h-screen">
      <header className="site-header">
        <div className="site-header-inner">
          <Brand light />
          <nav className="site-nav" aria-label="Primary navigation">
            {primaryLinks.map(([href, label]) => (
              <Link key={href} to={href} className={location.pathname === href ? "active" : ""}>{label}</Link>
            ))}
          </nav>
          <div className="site-header-actions">
            <Link to="/about" className="site-nav-secondary">About</Link>
            <Link to="/rooms" className="button button-primary button-small">Start talking</Link>
          </div>
        </div>
      </header>

      <main className={compact ? "public-main public-main-compact" : "public-main"}>
        <section className="public-hero" aria-labelledby="public-page-title">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 id="public-page-title">{title}</h1>
          <p className="public-hero-copy">{description}</p>
        </section>
        {children}
      </main>

      <footer className="site-footer">
        <div className="site-footer-grid">
          <div>
            <Brand light />
            <p className="site-footer-note">A calmer way to meet people, share a room, and leave whenever you choose.</p>
          </div>
          <FooterColumn title="Explore" links={primaryLinks} />
          <FooterColumn title="Company" links={companyLinks} />
          <FooterColumn title="Policies" links={legalLinks} />
        </div>
        <div className="site-footer-bottom">
          <span>18+ community. Be kind. Stay in control.</span>
          <span>© {new Date().getFullYear()} RandomConnect</span>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <h2 className="site-footer-heading">{title}</h2>
      <nav className="site-footer-links" aria-label={`${title} links`}>
        {links.map(([href, label]) => <Link key={href} to={href}>{label}</Link>)}
      </nav>
    </div>
  );
}

export function ContentSection({ title, children, tone = "default" }) {
  return <section className={`public-section public-section-${tone}`}><div className="public-section-inner"><h2>{title}</h2>{children}</div></section>;
}

export function ActionLink({ to, children }) {
  return <Link to={to} className="button button-primary">{children}</Link>;
}
