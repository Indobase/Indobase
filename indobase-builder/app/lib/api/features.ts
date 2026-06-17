export interface Feature {
  id: string;
  name: string;
  description: string;
  viewed: boolean;
  releaseDate: string;
}

const FEATURE_RELEASES: Omit<Feature, 'viewed'>[] = [
  {
    id: 'indobase-builder-launch',
    name: 'Indobase Builder Landing Refresh',
    description: 'The Builder home screen now has a clearer launch flow, starter prompts, and featured app templates.',
    releaseDate: '2026-06-16',
  },
  {
    id: 'indobase-studio-handoff',
    name: 'Studio-Linked Builder Sessions',
    description: 'Launch Builder directly from Studio with project-aware backend connection and hosting links.',
    releaseDate: '2026-06-16',
  },
  {
    id: 'indobase-native-hosting',
    name: 'Indobase Native Hosting Handoff',
    description:
      'Publishing actions now point users to Indobase-managed hosting and custom-domain flows instead of third-party defaults.',
    releaseDate: '2026-06-16',
  },
];

export const getFeatureFlags = async (): Promise<Feature[]> => {
  return FEATURE_RELEASES.map((feature) => ({ ...feature, viewed: false }));
};

export const markFeatureViewed = async (featureId: string): Promise<void> => {
  const featureExists = FEATURE_RELEASES.some((feature) => feature.id === featureId);

  if (!featureExists) {
    throw new Error(`Unknown feature flag: ${featureId}`);
  }
};
