"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";
import { mainNavItems, getMobileNavItems, type NavItem } from "./nav-model";
import styles from "./AppShell.module.css";

interface AppShellProps {
  /** Main content slot */
  children: ReactNode;
  /** Optional header slot (e.g., page title, breadcrumbs) */
  header?: ReactNode;
  /** Optional sidebar footer slot (e.g., user info) */
  sidebarFooter?: ReactNode;
}

export function AppShell({ children, header, sidebarFooter }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const mobileNavItems = getMobileNavItems();

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className={styles.shell}>
      {/* Mobile header */}
      <header className={styles.mobileHeader}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={toggleSidebar}
          aria-expanded={sidebarOpen}
          aria-controls="sidebar"
          aria-label={
            sidebarOpen
              ? t("accessibility.closeMenu")
              : t("accessibility.openMenu")
          }
        >
          {sidebarOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
        <span className={styles.mobileTitle}>{t("common.appName")}</span>
      </header>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className={styles.overlay}
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="sidebar"
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
        aria-label="Main navigation"
      >
        <div className={styles.sidebarHeader}>
          <Link href="/app" className={styles.logo} onClick={closeSidebar}>
            <RadarIcon />
            <span>{t("common.appName")}</span>
          </Link>
        </div>

        <nav className={styles.nav}>
          <ul className={styles.navList}>
            {mainNavItems.map((item) => (
              <li key={item.id}>
                <NavLink
                  item={item}
                  isActive={pathname === item.href}
                  onClick={closeSidebar}
                />
              </li>
            ))}
          </ul>
        </nav>

        {sidebarFooter && (
          <div className={styles.sidebarFooter}>{sidebarFooter}</div>
        )}
      </aside>

      {/* Main content area */}
      <div className={styles.main}>
        {header && <header className={styles.contentHeader}>{header}</header>}
        <main id="main-content" className={styles.content}>
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className={styles.mobileNav} aria-label="Mobile navigation">
        <ul className={styles.mobileNavList}>
          {mobileNavItems.map((item) => (
            <li key={item.id}>
              <MobileNavLink item={item} isActive={pathname === item.href} />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

interface NavLinkProps {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
}

function NavLink({ item, isActive, onClick }: NavLinkProps) {
  return (
    <Link
      href={item.href}
      className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
    >
      <span className={styles.navIcon}>
        <NavIcon icon={item.icon} />
      </span>
      <span>{t(item.labelKey as Parameters<typeof t>[0])}</span>
    </Link>
  );
}

function MobileNavLink({ item, isActive }: Omit<NavLinkProps, "onClick">) {
  return (
    <Link
      href={item.href}
      className={`${styles.mobileNavLink} ${isActive ? styles.mobileNavLinkActive : ""}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className={styles.mobileNavIcon}>
        <NavIcon icon={item.icon} />
      </span>
      <span className={styles.mobileNavLabel}>
        {t(item.labelKey as Parameters<typeof t>[0])}
      </span>
    </Link>
  );
}

// Icon components
function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  switch (icon) {
    case "home":
      return <HomeIcon />;
    case "digest":
      return <DigestIcon />;
    case "sources":
      return <SourcesIcon />;
    case "settings":
      return <SettingsIcon />;
    case "admin":
      return <AdminIcon />;
  }
}

function MenuIcon() {
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
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
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
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function RadarIcon() {
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
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function HomeIcon() {
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
      aria-hidden="true"
    >
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function DigestIcon() {
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
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function SourcesIcon() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
    </svg>
  );
}

function SettingsIcon() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function AdminIcon() {
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
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
