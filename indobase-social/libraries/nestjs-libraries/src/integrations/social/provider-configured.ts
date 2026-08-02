/**
 * Whether a social provider can be connected on this deployment.
 * Custom-field providers (API token / login) do not need server OAuth apps.
 * OAuth providers require their CLIENT_ID / SECRET (or APP_ID / SECRET) env vars.
 */
export function isSocialProviderConfigured(identifier: string): boolean {
  const required = PROVIDER_REQUIRED_ENV[identifier];
  if (!required) {
    // Unknown / customFields-only providers default to available.
    return true;
  }
  return required.every((key) => {
    const v = process.env[key];
    return typeof v === 'string' && v.trim().length > 0;
  });
}

const PROVIDER_REQUIRED_ENV: Record<string, string[]> = {
  x: ['X_API_KEY', 'X_API_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  'linkedin-page': ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
  github: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  instagram: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  'instagram-standalone': ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  gmb: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET'],
  pinterest: ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET'],
  dribbble: ['DRIBBBLE_CLIENT_ID', 'DRIBBBLE_CLIENT_SECRET'],
  tumblr: ['TUMBLR_CLIENT_ID', 'TUMBLR_CLIENT_SECRET'],
  discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
  slack: ['SLACK_ID', 'SLACK_SECRET'],
  mastodon: ['MASTODON_CLIENT_ID', 'MASTODON_CLIENT_SECRET'],
  twitch: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
  vk: ['VK_ID'],
  whop: ['WHOP_CLIENT_ID'],
  mewe: ['MEWE_APP_ID'],
  kick: ['KICK_CLIENT_ID', 'KICK_CLIENT_SECRET'],
  telegram: ['TELEGRAM_TOKEN'],
  // customFields / user-provided credentials — always configured:
  // bluesky, lemmy, wordpress, medium, hashnode, devto, nostr, listmonk,
  // wrapcast, skool, moltbok, mastodon-custom
};
