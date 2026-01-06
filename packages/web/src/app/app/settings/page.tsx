import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { DevSettingsForm } from "@/components/DevSettings";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <div className={styles.settings}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("settings.title")}</h1>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("settings.appearance.title")}</h2>
        <div className={styles.sectionContent}>
          <ThemeSwitcher showLayout={true} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("settings.dev.title")}</h2>
        <div className={styles.sectionContent}>
          <DevSettingsForm />
        </div>
      </section>
    </div>
  );
}
