/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { MODEL_REGEX, PROVIDER_REGEX, STUDIO_CONTEXT_REGEX } from '~/utils/constants';
import { Markdown } from './Markdown';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';

interface UserMessageProps {
  content: string | Array<{ type: string; text?: string; image?: string }>;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
}

export function UserMessage({ content, parts }: UserMessageProps) {
  const profile = useStore(profileStore);

  const images =
    parts?.filter(
      (part): part is FileUIPart => part.type === 'file' && 'mimeType' in part && part.mimeType.startsWith('image/'),
    ) || [];

  if (Array.isArray(content)) {
    const textItem = content.find((item) => item.type === 'text');
    const textContent = stripMetadata(textItem?.text || '');

    return (
      <div className="flex w-full flex-col items-end gap-2">
        <div className="flex items-center gap-2 self-end">
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={profile?.username || 'User'}
              className="h-6 w-6 rounded-full object-cover"
              loading="eager"
              decoding="sync"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600">
              {(profile?.username || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          {profile?.username ? <span className="text-xs font-medium text-gray-500">{profile.username}</span> : null}
        </div>
        <div className="max-w-[92%] rounded-2xl bg-white px-4 py-3 text-gray-900 shadow-sm ring-1 ring-black/5">
          {textContent && <Markdown html>{textContent}</Markdown>}
          {images.map((item, index) => (
            <img
              key={index}
              src={`data:${item.mimeType};base64,${item.data}`}
              alt={`Image ${index + 1}`}
              className="mt-2 max-h-[512px] max-w-full rounded-xl object-contain"
            />
          ))}
        </div>
      </div>
    );
  }

  const textContent = stripMetadata(content);

  return (
    <div className="ml-auto flex max-w-[92%] flex-col gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((item, index) => (
            <img
              key={index}
              src={`data:${item.mimeType};base64,${item.data}`}
              alt={`Image ${index + 1}`}
              className="h-16 w-16 rounded-xl object-cover ring-1 ring-black/5"
            />
          ))}
        </div>
      )}
      <div className="rounded-2xl bg-white px-4 py-3.5 text-gray-900 shadow-sm ring-1 ring-black/5">
        <Markdown html>{textContent}</Markdown>
      </div>
    </div>
  );
}

function stripMetadata(content: string) {
  const artifactRegex = /<boltArtifact\s+[^>]*>[\s\S]*?<\/boltArtifact>/gm;
  return content
    .replace(MODEL_REGEX, '')
    .replace(PROVIDER_REGEX, '')
    .replace(STUDIO_CONTEXT_REGEX, '')
    .replace(artifactRegex, '');
}
