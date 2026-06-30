export type BuilderPromptQuotaState = {
  plan: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  isFree: boolean;
  upgradeUrl?: string;
  studioUrl?: string;
};
