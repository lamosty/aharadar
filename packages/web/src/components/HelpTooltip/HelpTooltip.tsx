"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./HelpTooltip.module.css";

interface HelpTooltipProps {
  content: React.ReactNode;
  title?: string;
}

/**
 * A help tooltip component with a question mark icon.
 * Shows a popover with explanation on click (mobile) or hover (desktop).
 */
export function HelpTooltip({ content, title }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <span className={styles.wrapper}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        aria-label="Help"
        aria-expanded={isOpen}
      >
        <QuestionIcon />
      </button>
      {isOpen && (
        <div ref={tooltipRef} className={styles.popover} role="tooltip">
          <div className={styles.popoverArrow} />
          <div className={styles.popoverContent}>
            {title && <div className={styles.popoverTitle}>{title}</div>}
            <div className={styles.popoverBody}>{content}</div>
          </div>
        </div>
      )}
    </span>
  );
}

function QuestionIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/**
 * Inline label with help tooltip.
 * Use this to wrap field labels with an attached help icon.
 */
interface LabelWithHelpProps {
  label: string;
  help: React.ReactNode;
  helpTitle?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}

export function LabelWithHelp({
  label,
  help,
  helpTitle,
  required,
  htmlFor,
  className,
}: LabelWithHelpProps) {
  return (
    <label htmlFor={htmlFor} className={className}>
      {label}
      {required && <span className={styles.required}>*</span>}
      <HelpTooltip content={help} title={helpTitle} />
    </label>
  );
}
