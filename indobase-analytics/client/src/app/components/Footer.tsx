import Image from "next/image";
import Link from "next/link";
import { useExtracted } from "next-intl";
import { useWhiteLabel } from "../../hooks/useIsWhiteLabel";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import {
  INDOBASE_ANALYTICS_DOCS_URL,
  INDOBASE_HOME_URL,
  INDOBASE_PRIVACY_URL,
  INDOBASE_SOURCE_URL,
  INDOBASE_SUPPORT_EMAIL,
  INDOBASE_TERMS_URL,
  IS_CLOUD,
} from "../../lib/const";

interface FooterProps {
  disabled?: boolean;
}

export function Footer({ disabled = false }: FooterProps) {
  const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;
  const { isWhiteLabel } = useWhiteLabel();
  const t = useExtracted();
  if (disabled || isWhiteLabel) {
    return null;
  }

  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-850 bg-neutral-50 dark:bg-neutral-900">
      <div className="max-w-[1100px] mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          <div className="space-y-4">
            <Image
              src="/indobase/wordmark.svg"
              alt="Indobase Analytics"
              width={140}
              height={28}
              style={{ width: 140, height: 28, objectFit: "contain" }}
            />
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Privacy-focused web analytics by Indobase.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{t("Resources")}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={INDOBASE_ANALYTICS_DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  {t("Documentation")}
                </a>
              </li>
              <li>
                <a
                  href={INDOBASE_SOURCE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href={INDOBASE_HOME_URL}
                  className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  Indobase
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{t("Company")}</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={INDOBASE_PRIVACY_URL}
                  className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  {t("Privacy Policy")}
                </a>
              </li>
              <li>
                <a
                  href={INDOBASE_TERMS_URL}
                  className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                >
                  {t("Terms and Conditions")}
                </a>
              </li>
              {IS_CLOUD && (
                <li>
                  <a
                    href={INDOBASE_SUPPORT_EMAIL}
                    className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                  >
                    {t("Support")}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-neutral-200 dark:border-neutral-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-sm text-neutral-500 dark:text-neutral-400">
              <span>{t("© {year} Indobase. All rights reserved.", { year: String(new Date().getFullYear()) })}</span>
              {APP_VERSION ? <span>v{APP_VERSION}</span> : null}
            </div>
            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <Link
                href={INDOBASE_HOME_URL}
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              >
                Indobase
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
