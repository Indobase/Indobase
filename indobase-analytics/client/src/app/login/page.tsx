"use client";

import { AuthButton } from "@/components/auth/AuthButton";
import { AuthError } from "@/components/auth/AuthError";
import { AuthInput } from "@/components/auth/AuthInput";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { Turnstile } from "@/components/auth/Turnstile";
import { useExtracted } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IndobaseTextLogo } from "../../components/IndobaseLogo";
import { SpinningGlobe } from "../../components/SpinningGlobe";
import { useSetPageTitle } from "../../hooks/useSetPageTitle";
import { authClient } from "../../lib/auth";
import { useConfigs } from "../../lib/configs";
import { IS_CLOUD } from "../../lib/const";
import { userStore } from "../../lib/userStore";

export default function Page() {
  const { configs, isLoading: isLoadingConfigs } = useConfigs();
  useSetPageTitle("Indobase Analytics — Login");
  const t = useExtracted();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const router = useRouter();

  const studioUrl =
    process.env.NEXT_PUBLIC_STUDIO_PUBLIC_URL?.replace(/\/+$/, "") || "https://studio.indobase.in";
  const studioOnly = !isLoadingConfigs && !!configs?.disableSignup;

  useEffect(() => {
    if (studioOnly) {
      window.location.replace(`${studioUrl}/sign-in`);
    }
  }, [studioOnly, studioUrl]);

  // Studio-SSO-only deployments: no local password login — bounce to Studio.
  if (studioOnly) {
    return (
      <div className="flex h-dvh w-full items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          <IndobaseTextLogo />
          <p className="text-sm text-muted-foreground">
            Indobase Analytics opens from Studio. Redirecting to sign in…
          </p>
          <a className="text-sm underline text-primary" href={`${studioUrl}/sign-in`}>
            Continue to Studio
          </a>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    setError("");

    // Validate Turnstile token if in cloud mode and production
    if (IS_CLOUD && process.env.NODE_ENV === "production" && !turnstileToken) {
      setError(t("Please complete the captcha verification"));
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await authClient.signIn.email(
        {
          email,
          password,
        },
        {
          onRequest: context => {
            if (IS_CLOUD && process.env.NODE_ENV === "production" && turnstileToken) {
              context.headers.set("x-captcha-response", turnstileToken);
            }
          },
        }
      );
      if (data?.user) {
        userStore.setState({
          user: data.user,
        });
        router.push("/");
      }

      if (error) {
        setError(error.message);
      }
    } catch (error) {
      setError(String(error));
    }
    setIsLoading(false);
  };

  const turnstileEnabled = IS_CLOUD && process.env.NODE_ENV === "production";

  return (
    <div className="flex h-dvh w-full">
      {/* Left panel - login form */}
      <div className="w-full lg:w-[550px] flex flex-col p-6 lg:p-10">
        {/* Logo at top left */}
        <div className="mb-8">
          <a href="https://studio.indobase.in" className="inline-block">
            <IndobaseTextLogo />
          </a>
        </div>
        <div className="flex-1 flex flex-col justify-center w-full max-w-[550px] mx-auto">
          <h1 className="text-lg text-neutral-600 dark:text-neutral-300 mb-6">{t("Welcome back")}</h1>
          <div className="flex flex-col gap-4">
            <SocialButtons onError={setError} />
            <form onSubmit={handleSubmit}>
              <div className="flex flex-col gap-4">
                <AuthInput
                  id="email"
                  label={t("Email")}
                  type="email"
                  placeholder="example@email.com"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />

                <AuthInput
                  id="password"
                  label={t("Password")}
                  type="password"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  rightElement={
                    IS_CLOUD && (
                      <Link href="/reset-password" className="text-xs text-muted-foreground hover:text-primary">
                        {t("Forgot password?")}
                      </Link>
                    )
                  }
                />

                {turnstileEnabled && (
                  <Turnstile
                    onSuccess={token => setTurnstileToken(token)}
                    onError={() => setTurnstileToken("")}
                    onExpire={() => setTurnstileToken("")}
                    className="flex justify-center"
                  />
                )}

                <AuthButton
                  isLoading={isLoading}
                  loadingText={t("Logging in...")}
                  disabled={turnstileEnabled ? !turnstileToken || isLoading : isLoading}
                >
                  {t("Login")}
                </AuthButton>

                <AuthError error={error} title={t("Error Logging In")} />
              </div>
            </form>

            {(!configs?.disableSignup || !isLoadingConfigs) && (
              <div className="text-center text-sm">
                {t("Don't have an account?")}{" "}
                <Link
                  href="/signup"
                  className="underline underline-offset-4 hover:text-emerald-400 transition-colors duration-300"
                >
                  {t("Sign up")}
                </Link>
              </div>
            )}
          </div>
        </div>

        {!IS_CLOUD && (
          <div className="text-xs text-muted-foreground mt-8">
            <a href="https://indobase.in" rel="noopener" title="Indobase Analytics">
              Indobase Analytics
            </a>
          </div>
        )}
      </div>

      {/* Right panel - globe (hidden on mobile/tablet) */}
      <div className="hidden lg:block lg:w-[calc(100%-550px)] relative m-3 rounded-2xl overflow-hidden">
        <SpinningGlobe />
      </div>
    </div>
  );
}
