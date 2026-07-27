"use client";

import { CodeSnippet } from "@/components/CodeSnippet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight } from "lucide-react";
import { useExtracted } from "next-intl";
import { useState } from "react";

import { SettingsSection, SettingsSections } from "./SettingsSection";

interface ScriptBuilderProps {
  siteId: string;
  siteType?: "web" | "mobile" | null;
  appIdentifier?: string;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 dark:focus-visible:ring-neutral-300";

// Use single quotes for attribute values that contain double quotes (JSON arrays).
const formatAttr = ([key, value]: [string, string]) =>
  value.includes('"') ? `${key}='${value}'` : `${key}="${value}"`;

export function ScriptBuilder({ siteId, siteType = "web", appIdentifier: _appIdentifier }: ScriptBuilderProps) {
  const t = useExtracted();
  const [debounceValue, setDebounceValue] = useState(500);
  const [skipPatterns, setSkipPatterns] = useState<string[]>([]);
  const [skipPatternsText, setSkipPatternsText] = useState("");
  const [maskPatterns, setMaskPatterns] = useState<string[]>([]);
  const [maskPatternsText, setMaskPatternsText] = useState("");
  const [showJsFallback, setShowJsFallback] = useState(false);

  // Handle pattern text area changes
  const handleSkipPatternsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSkipPatternsText(e.target.value);
    try {
      // Try to parse as JSON if it starts with [ and ends with ]
      if (e.target.value.trim().startsWith("[") && e.target.value.trim().endsWith("]")) {
        setSkipPatterns(JSON.parse(e.target.value.trim()));
      } else {
        // Otherwise treat as line-separated values
        setSkipPatterns(
          e.target.value
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0)
        );
      }
    } catch (err) {
      // If parsing fails, split by new lines
      setSkipPatterns(
        e.target.value
          .split("\n")
          .map(line => line.trim())
          .filter(line => line.length > 0)
      );
    }
  };

  const handleMaskPatternsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMaskPatternsText(e.target.value);
    try {
      // Try to parse as JSON if it starts with [ and ends with ]
      if (e.target.value.trim().startsWith("[") && e.target.value.trim().endsWith("]")) {
        setMaskPatterns(JSON.parse(e.target.value.trim()));
      } else {
        // Otherwise treat as line-separated values
        setMaskPatterns(
          e.target.value
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0)
        );
      }
    } catch (err) {
      // If parsing fails, split by new lines
      setMaskPatterns(
        e.target.value
          .split("\n")
          .map(line => line.trim())
          .filter(line => line.length > 0)
      );
    }
  };

  // Build the data attributes shared by every snippet variation, so the HTML,
  // JavaScript injection, and AI agent versions all reflect the configured options.
  const scriptUrl = `${globalThis.location.origin}/api/script.js`;
  const dataAttributes: [string, string][] = [["data-site-id", siteId]];
  if (debounceValue !== 500) {
    dataAttributes.push(["data-debounce", String(debounceValue)]);
  }
  if (skipPatterns.length > 0) {
    dataAttributes.push(["data-skip-patterns", JSON.stringify(skipPatterns)]);
  }
  if (maskPatterns.length > 0) {
    dataAttributes.push(["data-mask-patterns", JSON.stringify(maskPatterns)]);
  }

  // Generate tracking script dynamically based on options
  const trackingScript = `<script
    src="${scriptUrl}"
${dataAttributes.map(attr => `    ${formatAttr(attr)}`).join("\n")}
    defer
></script>`;

  const jsSnippet = `<script>
  (function() {
    var el = document.createElement("script");
    el.src = "${scriptUrl}";
    el.defer = true;
${dataAttributes.map(([key, value]) => `    el.setAttribute("${key}", ${JSON.stringify(value)});`).join("\n")}
    document.head.appendChild(el);
  })();
</script>`;

  const inlineScript = `<script src="${scriptUrl}" ${dataAttributes.map(formatAttr).join(" ")} defer></script>`;

  const aiPrompt = `Install Indobase Analytics on this website.

Add this script tag to the <head> of every page, using the root layout or base template if there is one:

${inlineScript}
`;

  const mobileSnippet = `<!-- Load Indobase Analytics in a WebView (or inject via your app bridge) -->
<script
  src="${scriptUrl}"
  data-site-id="${siteId}"
  defer
></script>

<script>
  // After the script loads, track screens/events via window.indobase
  window.indobase?.event("screen_view", { screen: "Home" });
  window.indobase?.event("signup_started", { plan: "pro" });
</script>`;

  const mobileAiPrompt = `Install Indobase Analytics in this mobile / React Native app.

Use the Indobase Analytics browser tracker (script tag + window.indobase) inside a WebView, or call the same API from your JS bridge after injecting the script.

1. Load the tracking script:

<script src="${scriptUrl}" data-site-id="${siteId}" defer></script>

2. Track screens and events:

window.indobase.event("screen_view", { screen: "Home" });
window.indobase.event("signup_started", { plan: "pro" });

Docs: https://github.com/Indobase/Indobase/blob/main/docs/INDOBASE-ANALYTICS.md`;

  if (siteType === "mobile") {
    return (
      <SettingsSections>
        <SettingsSection
          description={t(
            "Use the Indobase Analytics script with window.indobase (WebView or JS bridge). See the docs for details."
          )}
        >
          <CodeSnippet language="HTML" code={mobileSnippet} />
          <p className="text-xs text-muted-foreground">
            <a
              href="https://github.com/Indobase/Indobase/blob/main/docs/INDOBASE-ANALYTICS.md"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {t("Indobase Analytics docs")}
            </a>
          </p>
          <CodeSnippet code={mobileAiPrompt} />
        </SettingsSection>
      </SettingsSections>
    );
  }

  return (
    <SettingsSections>
      <SettingsSection description={t("Add this script to the {headTag} of your website", { headTag: "<head>" })}>
        <Tabs defaultValue="html">
          <TabsList>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="ai">{t("AI agent")}</TabsTrigger>
          </TabsList>
          <TabsContent value="html" className="flex flex-col gap-2">
            <CodeSnippet language="HTML" code={trackingScript} />
            <div>
              <button
                type="button"
                onClick={() => setShowJsFallback(!showJsFallback)}
                aria-expanded={showJsFallback}
                className={`inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground ${FOCUS_RING}`}
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 motion-safe:transition-transform ${showJsFallback ? "rotate-90" : ""}`}
                />
                {t("If the snippet doesn't work, try JavaScript injection")}
              </button>
              {showJsFallback && (
                <div className="mt-2 flex flex-col gap-2">
                  <p className="text-xs text-muted-foreground">
                    {t("Paste this into the {headTag} of your website:", { headTag: "<head>" })}
                  </p>
                  <CodeSnippet language="HTML" code={jsSnippet} />
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="ai" className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t("Copy this prompt into Claude Code, Cursor, or another coding agent:")}
            </p>
            <CodeSnippet code={aiPrompt} />
          </TabsContent>
        </Tabs>
      </SettingsSection>

      <SettingsSection title={t("Options")}>
        {/* Skip Patterns Option */}
        <div className="space-y-2">
          <div>
            <Label htmlFor="skipPatterns" className="text-sm font-medium text-foreground block">
              {t("Skip Patterns")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("URL patterns to exclude from tracking (one per line)")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("Use * for single segment wildcard, ** for multi-segment wildcard")}
            </p>
            <Textarea
              id="skipPatterns"
              placeholder="/admin/**&#10;/preview/*"
              className="mt-2 font-mono text-sm"
              value={skipPatternsText}
              onChange={handleSkipPatternsChange}
            />
          </div>
        </div>

        {/* Mask Patterns Option */}
        <div className="space-y-2">
          <div>
            <Label htmlFor="maskPatterns" className="text-sm font-medium text-foreground block">
              {t("Mask Patterns")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("URL patterns to anonymize in analytics (one per line)")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("E.g. /users/*/profile will hide usernames, /orders/** will hide order details")}
            </p>
            <Textarea
              id="maskPatterns"
              placeholder="/users/*/profile&#10;/orders/**"
              className="mt-2 font-mono text-sm"
              value={maskPatternsText}
              onChange={handleMaskPatternsChange}
            />
          </div>
        </div>

        {/* Debounce Option */}
        <div className="space-y-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debounce" className="text-sm font-medium text-foreground">
              {t("Debounce Duration (ms)")}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="debounce"
                type="number"
                min="0"
                max="5000"
                value={debounceValue}
                onChange={e => setDebounceValue(parseInt(e.target.value) || 0)}
                className="max-w-[120px]"
              />
              <span className="text-xs text-muted-foreground">{t("Default: 500ms")}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Time to wait before tracking a pageview after URL changes")}
          </p>
        </div>
      </SettingsSection>
    </SettingsSections>
  );
}
