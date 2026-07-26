/** Resolve OAuth UI env with Indobase names first, legacy POSTIZ_* fallback. */
export function socialOauthPublicEnv(): {
  genericOauth: boolean;
  oauthLogoUrl: string;
  oauthDisplayName: string;
} {
  const generic =
    process.env.NEXT_PUBLIC_INDOBASE_GENERIC_OAUTH ??
    process.env.INDOBASE_GENERIC_OAUTH ??
    process.env.POSTIZ_GENERIC_OAUTH;
  return {
    genericOauth: !!generic && generic !== 'false',
    oauthLogoUrl:
      process.env.NEXT_PUBLIC_INDOBASE_OAUTH_LOGO_URL ||
      process.env.NEXT_PUBLIC_POSTIZ_OAUTH_LOGO_URL ||
      '',
    oauthDisplayName:
      process.env.NEXT_PUBLIC_INDOBASE_OAUTH_DISPLAY_NAME ||
      process.env.NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME ||
      '',
  };
}

export function isSocialGenericOauthEnabled(): boolean {
  const v =
    process.env.INDOBASE_GENERIC_OAUTH ??
    process.env.POSTIZ_GENERIC_OAUTH ??
    process.env.NEXT_PUBLIC_INDOBASE_GENERIC_OAUTH;
  return !!v && v !== 'false';
}
