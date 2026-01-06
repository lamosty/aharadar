import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/" className={styles.logo}>
            <RadarIcon />
            <span>{t("common.appName")}</span>
          </Link>
          <nav className={styles.headerNav}>
            <Link href="/login" className={styles.headerLink}>
              {t("nav.login")}
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero section */}
      <main id="main-content">
        <section className={styles.hero} data-testid="hero-section">
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle} data-testid="hero-title">{t("landing.hero.title")}</h1>
            <p className={styles.heroSubtitle}>{t("landing.hero.subtitle")}</p>
            <div className={styles.heroActions}>
              <Link href="/app" className={`btn btn-primary ${styles.heroCta}`} data-testid="hero-cta">
                {t("landing.hero.cta")}
              </Link>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.heroRadar}>
              <RadarAnimation />
            </div>
          </div>
        </section>

        {/* Features section */}
        <section className={styles.features} data-testid="features-section">
          <div className={styles.featuresContent}>
            <h2 className={styles.featuresTitle}>
              {t("landing.features.title")}
            </h2>
            <div className={styles.featureGrid}>
              <FeatureCard
                icon={<PersonalizedIcon />}
                title={t("landing.features.personalized.title")}
                description={t("landing.features.personalized.description")}
              />
              <FeatureCard
                icon={<MultiSourceIcon />}
                title={t("landing.features.multiSource.title")}
                description={t("landing.features.multiSource.description")}
              />
              <FeatureCard
                icon={<BudgetIcon />}
                title={t("landing.features.budgetAware.title")}
                description={t("landing.features.budgetAware.description")}
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <p className={styles.footerText}>
            {t("common.appName")} - Surface signal from noise
          </p>
        </div>
      </footer>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureIcon}>{icon}</div>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDescription}>{description}</p>
    </div>
  );
}

// Icon components
function RadarIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function RadarAnimation() {
  return (
    <svg
      viewBox="0 0 200 200"
      className={styles.radarSvg}
      aria-hidden="true"
    >
      {/* Radar circles */}
      <circle cx="100" cy="100" r="80" fill="none" stroke="var(--color-border)" strokeWidth="1" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="var(--color-border)" strokeWidth="1" />
      <circle cx="100" cy="100" r="40" fill="none" stroke="var(--color-border)" strokeWidth="1" />
      <circle cx="100" cy="100" r="20" fill="none" stroke="var(--color-border)" strokeWidth="1" />

      {/* Cross lines */}
      <line x1="100" y1="20" x2="100" y2="180" stroke="var(--color-border-subtle)" strokeWidth="1" />
      <line x1="20" y1="100" x2="180" y2="100" stroke="var(--color-border-subtle)" strokeWidth="1" />

      {/* Sweeping line */}
      <line
        x1="100"
        y1="100"
        x2="100"
        y2="20"
        stroke="var(--color-primary)"
        strokeWidth="2"
        className={styles.radarSweep}
      />

      {/* Center dot */}
      <circle cx="100" cy="100" r="4" fill="var(--color-primary)" />

      {/* Signal dots */}
      <circle cx="130" cy="60" r="4" fill="var(--color-primary)" className={styles.radarDot1} />
      <circle cx="70" cy="80" r="3" fill="var(--color-primary)" className={styles.radarDot2} />
      <circle cx="140" cy="120" r="5" fill="var(--color-primary)" className={styles.radarDot3} />
    </svg>
  );
}

function PersonalizedIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MultiSourceIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

function BudgetIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
