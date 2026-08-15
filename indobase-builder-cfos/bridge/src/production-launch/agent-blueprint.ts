/**
 * Generate contract for agents: blueprint (definition of done) + skills (how to build).
 * Source of truth: @indobase/builder-agent — this module re-exports for the bridge.
 */

export {
  GENERATE_SKILL_ID,
  STACK_SKILL,
  WIRE_SKILL,
  LIVE_SKILL,
  LANDING_LEADS_SKILL,
  SAAS_AUTH_SKILL,
  ECOMMERCE_COMMERCE_SKILL,
  ALL_GENERATE_SKILLS,
  blueprintForAppType,
  composeGenerateSkillsHint,
  listSkillIds,
  skillsForAppType,
  type ApplicationBlueprint,
  type BuilderAppType,
  type GenerateSkill,
} from '@indobase/builder-agent'
