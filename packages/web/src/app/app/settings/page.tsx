import type { Metadata } from "next";
import { t } from "@/lib/i18n";
import { AccountSettings } from "@/components/AccountSettings";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { DevSettingsForm } from "@/components/DevSettings";
import { ExperimentalFeaturesForm } from "@/components/ExperimentalFeatures";
import { ApiKeysSettings } from "@/components/ApiKeysSettings";
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
        <h2 className={styles.sectionTitle}>{t("account.title")}</h2>
        <div className={styles.sectionContent}>
          <AccountSettings />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("settings.apiKeys.title")}</h2>
        <div className={styles.sectionContent}>
          <ApiKeysSettings />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("settings.appearance.title")}</h2>
        <div className={styles.sectionContent}>
          <ThemeSwitcher showLayout={true} />
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("settings.experimental.title")}</h2>
        <div className={styles.sectionContent}>
          <ExperimentalFeaturesForm />
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
