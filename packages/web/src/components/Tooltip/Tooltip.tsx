"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import styles from "./Tooltip.module.css";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: "top" | "bottom";
  className?: string;
}

/**
 * A tooltip component that wraps any element.
 * Shows a popover with explanation on hover (desktop) or click (mobile).
 */
export function Tooltip({ content, children, position = "top", className }: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on click outside (for mobile tap behavior)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
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
    <span
      ref={wrapperRef}
      className={`${styles.wrapper} ${className || ""}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={() => setIsOpen(!isOpen)}
    >
      {children}
      {isOpen && (
        <div ref={tooltipRef} className={`${styles.tooltip} ${styles[position]}`} role="tooltip">
          <div className={styles.arrow} />
          <div className={styles.content}>{content}</div>
        </div>
      )}
    </span>
  );
}
