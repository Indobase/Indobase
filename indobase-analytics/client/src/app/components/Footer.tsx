import Link from "next/link";
import Image from "next/image";
import { useExtracted } from "next-intl";
import { useWhiteLabel } from "../../hooks/useIsWhiteLabel";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import {
  INDOBASE_ANALYTICS_DOCS_URL,
  INDOBASE_HOME_URL,
  INDOBASE_PRIVACY_URL,
  INDOBASE_TERMS_URL,
} from "../../lib/const";

interface FooterProps {
  disabled?: boolean;
}

/**
 * Minimal Indobase product footer — no upstream sponsor/affiliate/social/community UI.
 */
export function Footer({ disabled = false }: FooterProps) {
  const { isWhiteLabel } = useWhiteLabel();
  const t = useExtracted();
  if (disabled || isWhiteLabel) {
    return null;
  }

  const year = String(new Date().getFullYear());

  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-850 bg-neutral-50 dark:bg-neutral-900">
      <div className="max-w-[1100px] mx-auto px-4 py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={INDOBASE_HOME_URL}
            className="flex items-center gap-2.5 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 dark:focus-visible:ring-neutral-300"
            aria-label="Indobase Analytics"
          >
            <Image
              src="/indobase/logo.svg"
              alt=""
              width={28}
              height={28}
              className="shrink-0"
              style={{ width: 28, height: 28 }}
            />
            <span className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Indobase Analytics
            </span>
          </Link>
          <span className="hidden sm:inline text-neutral-300 dark:text-neutral-700">·</span>
          <span className="text-sm text-neutral-500 dark:text-neutral-400 truncate">
            {t("© {year} Indobase. All rights reserved.", { year })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-500 dark:text-neutral-400">
          <a
            href={INDOBASE_ANALYTICS_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            {t("Documentation")}
          </a>
          <a
            href={INDOBASE_PRIVACY_URL}
            className="hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            {t("Privacy Policy")}
          </a>
          <a href={INDOBASE_TERMS_URL} className="hover:text-neutral-900 dark:hover:text-white transition-colors">
            {t("Terms and Conditions")}
          </a>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
