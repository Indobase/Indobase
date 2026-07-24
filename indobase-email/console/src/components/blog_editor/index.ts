/**
 * Indobase Editor - Public API
 *
 * Main entry point for the blog editor with dynamic styling support
 */

// Main component
export { IndobaseEditor, DEFAULT_INITIAL_CONTENT } from './IndobaseEditor'
export type { IndobaseEditorProps, IndobaseEditorRef, TOCAnchor } from './IndobaseEditor'

// Types
export type {
  EditorStyleConfig,
  CSSValue,
  DefaultStyles,
  ParagraphStyles,
  HeadingStyles,
  HeadingLevelStyles,
  CaptionStyles,
  SeparatorStyles,
  CodeBlockStyles,
  BlockquoteStyles,
  InlineCodeStyles,
  ListStyles,
  LinkStyles
} from './types/EditorStyleConfig'

// Default configuration
export { defaultEditorStyles } from './config/defaultEditorStyles'

// Style presets
export {
  academicPaperPreset
} from './presets'

// Utility functions
export { generateBlogPostCSS, clearCSSCache } from './utils/styleUtils'
export { validateStyleConfig, StyleConfigValidationError } from './utils/validateStyleConfig'
