import { previewIdle } from '~/lib/preview/preview-manager';
import { clearDraftPreview } from '~/lib/stores/draft-preview';
import { buildService } from './build-service';
import { workspaceService } from './workspace-service';

/** Reset workspace session state for a new chat or cleared workbench. */
export function resetBuilderSession(): void {
  workspaceService.reset();
  buildService.reset();
  clearDraftPreview();
}
