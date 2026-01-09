"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ApiKeyGuidance.module.css";

export type ApiKeyProvider = "quiver" | "unusual_whales" | "sec_edgar" | "finnhub";

interface ProviderInfo {
  name: string;
  description: string;
  envVar: string;
  website: string;
  signupUrl: string;
  docsUrl?: string;
  freeLimit?: string;
  steps: {
    title: string;
    content: React.ReactNode;
  }[];
}

const PROVIDER_INFO: Record<ApiKeyProvider, ProviderInfo> = {
  quiver: {
    name: "Quiver Quantitative",
    description: "Track stock trades disclosed by U.S. Congress members",
    envVar: "QUIVER_API_KEY",
    website: "quiverquant.com",
    signupUrl: "https://www.quiverquant.com/",
    docsUrl: "https://www.quiverquant.com/api/",
    freeLimit: "Paid plan required for API access",
    steps: [
      {
        title: "Create Account",
        content: (
          <>
            <p>
              Go to{" "}
              <a href="https://www.quiverquant.com/" target="_blank" rel="noopener noreferrer">
                quiverquant.com
              </a>{" "}
              and click <strong>Sign Up</strong>.
            </p>
            <p>You can sign up with email or Google account.</p>
          </>
        ),
      },
      {
        title: "Subscribe & get API key",
        content: (
          <>
            <p>After signing in:</p>
            <ol>
              <li>Upgrade to a plan that includes API access</li>
              <li>Go to your account dashboard</li>
              <li>Navigate to the API section and copy your key</li>
            </ol>
            <p>Note: Quiver’s free account is typically dashboard-only (no API key).</p>
          </>
        ),
      },
      {
        title: "Add to Environment",
        content: (
          <>
            <p>
              Add the key to your <code>.env</code> file:
            </p>
            <pre>QUIVER_API_KEY=your_api_key_here</pre>
            <p>Restart your server after adding the key.</p>
          </>
        ),
      },
    ],
  },
  unusual_whales: {
    name: "Unusual Whales",
    description: "Track unusual options activity, sweeps, and large orders",
    envVar: "UNUSUAL_WHALES_API_KEY",
    website: "unusualwhales.com",
    signupUrl: "https://unusualwhales.com/",
    docsUrl: "https://unusualwhales.com/public-api",
    freeLimit: "Paid plan required for API access",
    steps: [
      {
        title: "Create Account",
        content: (
          <>
            <p>
              Go to{" "}
              <a href="https://unusualwhales.com/" target="_blank" rel="noopener noreferrer">
                unusualwhales.com
              </a>{" "}
              and create an account.
            </p>
            <p>API access typically requires a paid subscription.</p>
          </>
        ),
      },
      {
        title: "Access API Portal",
        content: (
          <>
            <p>After signing in:</p>
            <ol>
              <li>Go to your account settings</li>
              <li>Find the API or Developer section</li>
              <li>Generate or copy your API key</li>
            </ol>
            <p>Check the documentation for current rate limits and available endpoints.</p>
          </>
        ),
      },
      {
        title: "Add to Environment",
        content: (
          <>
            <p>
              Add the key to your <code>.env</code> file:
            </p>
            <pre>UNUSUAL_WHALES_API_KEY=your_api_key_here</pre>
            <p>Restart your server after adding the key.</p>
          </>
        ),
      },
    ],
  },
  sec_edgar: {
    name: "SEC EDGAR",
    description:
      "Access SEC filings including Form 4 (insider trading) and 13F (institutional holdings)",
    envVar: "SEC_EDGAR_USER_AGENT",
    website: "sec.gov",
    signupUrl: "https://www.sec.gov/",
    docsUrl: "https://www.sec.gov/developer",
    freeLimit: "10 requests/second",
    steps: [
      {
        title: "No API Key Needed",
        content: (
          <>
            <p>
              The SEC EDGAR API is <strong>free and public</strong>. No account or API key is
              required.
            </p>
            <p>However, the SEC requires a valid User-Agent header with contact information.</p>
          </>
        ),
      },
      {
        title: "Configure User-Agent",
        content: (
          <>
            <p>
              Add your contact info to your <code>.env</code> file:
            </p>
            <pre>SEC_EDGAR_USER_AGENT=YourApp/1.0 (your@email.com)</pre>
            <p>
              Per SEC guidelines, include your app name and a valid email address where they can
              contact you if needed.
            </p>
          </>
        ),
      },
      {
        title: "Rate Limits",
        content: (
          <>
            <p>The SEC enforces a rate limit of:</p>
            <ul>
              <li>
                <strong>10 requests per second</strong>
              </li>
              <li>Minimum 100ms between requests</li>
            </ul>
            <p>The connector handles this automatically with built-in throttling.</p>
          </>
        ),
      },
    ],
  },
  finnhub: {
    name: "Finnhub",
    description: "Social sentiment data from Reddit, Twitter, and StockTwits",
    envVar: "FINNHUB_API_KEY",
    website: "finnhub.io",
    signupUrl: "https://finnhub.io/",
    docsUrl: "https://finnhub.io/docs/api",
    freeLimit: "60 requests/minute",
    steps: [
      {
        title: "Create Account",
        content: (
          <>
            <p>
              Go to{" "}
              <a href="https://finnhub.io/" target="_blank" rel="noopener noreferrer">
                finnhub.io
              </a>{" "}
              and click <strong>Get Free API Key</strong>.
            </p>
            <p>Sign up with your email address.</p>
          </>
        ),
      },
      {
        title: "Get API Key",
        content: (
          <>
            <p>After signing up:</p>
            <ol>
              <li>Check your email for verification</li>
              <li>Log into your Finnhub dashboard</li>
              <li>Your API key is displayed on the dashboard</li>
            </ol>
            <p>
              Free tier: <strong>60 API calls per minute</strong>
            </p>
          </>
        ),
      },
      {
        title: "Add to Environment",
        content: (
          <>
            <p>
              Add the key to your <code>.env</code> file:
            </p>
            <pre>FINNHUB_API_KEY=your_api_key_here</pre>
            <p>Restart your server after adding the key.</p>
          </>
        ),
      },
    ],
  },
};

interface ApiKeyGuidanceProps {
  provider: ApiKeyProvider;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal component showing step-by-step API key setup instructions
 */
export function ApiKeyGuidance({ provider, isOpen, onClose }: ApiKeyGuidanceProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);

  const info = PROVIDER_INFO[provider];
  const totalSteps = info.steps.length;

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const currentStepData = info.steps[currentStep];

  return (
    <div className={styles.overlay}>
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h3 className={styles.title}>
              <KeyIcon />
              Setup: {info.name}
            </h3>
            <p className={styles.subtitle}>{info.description}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className={styles.progressBar}>
          {info.steps.map((_, index) => (
            <div
              key={index}
              className={`${styles.progressStep} ${index <= currentStep ? styles.progressStepActive : ""}`}
            />
          ))}
        </div>

        <div className={styles.body}>
          <div className={styles.stepHeader}>
            <span className={styles.stepNumber}>Step {currentStep + 1}</span>
            <h4 className={styles.stepTitle}>{currentStepData.title}</h4>
          </div>
          <div className={styles.stepContent}>{currentStepData.content}</div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerInfo}>
            <span className={styles.envVar}>
              <code>{info.envVar}</code>
            </span>
            {info.freeLimit && <span className={styles.freeLimit}>{info.freeLimit}</span>}
          </div>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
              disabled={currentStep === 0}
            >
              Back
            </button>
            {currentStep < totalSteps - 1 ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => setCurrentStep((s) => Math.min(totalSteps - 1, s + 1))}
              >
                Next
              </button>
            ) : (
              <button type="button" className={styles.primaryButton} onClick={onClose}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline banner component for showing API key requirement within forms
 */
interface ApiKeyBannerProps {
  provider: ApiKeyProvider;
  onSetupClick: () => void;
}

export function ApiKeyBanner({ provider, onSetupClick }: ApiKeyBannerProps) {
  const info = PROVIDER_INFO[provider];

  return (
    <div className={styles.banner}>
      <div className={styles.bannerIcon}>
        <KeyIcon />
      </div>
      <div className={styles.bannerContent}>
        <p className={styles.bannerText}>
          Requires <code>{info.envVar}</code> environment variable
        </p>
        <button type="button" className={styles.bannerButton} onClick={onSetupClick}>
          Setup Instructions
        </button>
      </div>
    </div>
  );
}

function KeyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
