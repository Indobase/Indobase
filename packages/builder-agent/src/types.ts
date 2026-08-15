/**
 * Shared skill + blueprint types for Builder CFOS generate agents.
 */
export type BuilderAppType = 'landing' | 'saas' | 'ecommerce'

export type GenerateSkill = {
  id: string
  title: string
  /** Injected into the agent prompt. Keep concrete and short. */
  body: string
  /** App types this skill applies to. Empty = all. */
  appTypes?: BuilderAppType[]
}

export type ApplicationBlueprint = {
  appType: BuilderAppType
  version: string
  stack: 'vite-react-ts'
  mustProduce: string[]
  forbidden: string[]
  skills: GenerateSkill[]
}

export const GENERATE_SKILL_ID = 'generate-react-vite/v1' as const
