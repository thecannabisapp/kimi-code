import type { ContentPart, Message, TextPart } from '@moonshot-ai/kosong';

import type { ContextMessage } from './types';

export function project(history: readonly ContextMessage[]): Message[] {
  // Keep partial or empty assistant placeholders away from providers.
  // They can appear when a turn is aborted or errors before any content
  // or tool call is appended.
  const usable = history.filter((message) => {
    return (
      message.partial !== true &&
      !(message.role === 'assistant' && message.content.length === 0 && message.toolCalls.length === 0)
    );
  });
  // Trim orphan tool exchanges first so they do not block merging of the
  // user messages that surround them.
  const trimmed = trimOrphanToolExchanges(usable);
  return mergeAdjacentUserMessages(trimmed).map(stripContextMetadata);
}

function mergeAdjacentUserMessages(history: readonly ContextMessage[]): Message[] {
  const out: ContextMessage[] = [];
  for (const message of history) {
    const previous = out.at(-1);
    if (
      canMergeUserMessage(message) &&
      previous !== undefined &&
      canMergeUserMessage(previous)
    ) {
      out[out.length - 1] = mergeTwoUserMessages(previous, message);
      continue;
    }
    out.push(message);
  }
  return out.map(stripContextMetadata);
}

function canMergeUserMessage(message: ContextMessage): boolean {
  return message.role === 'user' && message.origin?.kind === 'user';
}

function mergeTwoUserMessages(a: ContextMessage, b: ContextMessage): ContextMessage {
  const aText = extractTextOnly(a);
  const bText = extractTextOnly(b);
  const nonTextParts = [
    ...a.content.filter((p) => p.type !== 'text'),
    ...b.content.filter((p) => p.type !== 'text'),
  ];
  const mergedText: TextPart = { type: 'text', text: `${aText}\n\n${bText}` };
  const content: ContentPart[] = [mergedText, ...nonTextParts];
  return {
    role: 'user',
    content,
    toolCalls: [],
    origin: a.origin,
  };
}

function extractTextOnly(message: Message): string {
  return message.content
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function stripContextMetadata(message: ContextMessage): Message {
  return {
    role: message.role,
    name: message.name,
    content: message.content.map((p) => ({ ...p })) as ContentPart[],
    toolCalls: message.toolCalls.map((tc) => ({ ...tc })),
    toolCallId: message.toolCallId,
    partial: message.partial,
  };
}

type TrimmableMessage = {
  role: string;
  content: readonly { type: string }[];
  toolCalls: readonly { id: string }[];
  toolCallId?: string | undefined;
};

/**
 * Remove assistant/tool exchanges whose tool_calls never received a matching
 * tool result. Matching is positional: a result only answers calls belonging
 * to the same assistant segment (up to the next assistant). This prevents
 * false matches when providers reuse toolCallIds across turns.
 */
function trimOrphanToolExchanges<T extends TrimmableMessage>(history: readonly T[]): T[] {
  type AssistantSegment = {
    assistantIndex: number;
    toolCallIds: readonly string[];
    toolIndices: readonly number[];
  };

  const segments: AssistantSegment[] = [];
  let currentAssistantIndex = -1;
  let currentToolIndices: number[] = [];

  for (let i = 0; i < history.length; i++) {
    const message = history[i];
    if (message === undefined) continue;

    if (message.role === 'assistant') {
      if (currentAssistantIndex !== -1) {
        segments.push({
          assistantIndex: currentAssistantIndex,
          toolCallIds: history[currentAssistantIndex]!.toolCalls.map((tc) => tc.id),
          toolIndices: currentToolIndices,
        });
      }
      currentAssistantIndex = message.toolCalls.length > 0 ? i : -1;
      currentToolIndices = [];
    } else if (message.role === 'tool' && currentAssistantIndex !== -1) {
      currentToolIndices.push(i);
    } else if (currentAssistantIndex !== -1) {
      // A non-tool message ends the segment for the current assistant.
      segments.push({
        assistantIndex: currentAssistantIndex,
        toolCallIds: history[currentAssistantIndex]!.toolCalls.map((tc) => tc.id),
        toolIndices: currentToolIndices,
      });
      currentAssistantIndex = -1;
      currentToolIndices = [];
    }
  }

  if (currentAssistantIndex !== -1) {
    segments.push({
      assistantIndex: currentAssistantIndex,
      toolCallIds: history[currentAssistantIndex]!.toolCalls.map((tc) => tc.id),
      toolIndices: currentToolIndices,
    });
  }

  const indicesToRemove = new Set<number>();
  const assistantMutations = new Map<number, { toolCalls: T['toolCalls'] }>();

  for (const segment of segments) {
    const assistant = history[segment.assistantIndex];
    if (assistant === undefined || assistant.toolCalls.length === 0) continue;

    const respondedIds = new Set<string>();
    for (const toolIndex of segment.toolIndices) {
      const toolCallId = history[toolIndex]?.toolCallId;
      if (typeof toolCallId === 'string') {
        respondedIds.add(toolCallId);
      }
    }

    const orphanIds = segment.toolCallIds.filter((id) => !respondedIds.has(id));
    if (orphanIds.length === 0) continue;

    const allOrphan = orphanIds.length === assistant.toolCalls.length;
    if (allOrphan && assistant.content.length === 0) {
      // The whole exchange is unanswered and the assistant has no other
      // content; discard the assistant and every sibling tool message.
      indicesToRemove.add(segment.assistantIndex);
      for (const toolIndex of segment.toolIndices) {
        indicesToRemove.add(toolIndex);
      }
      continue;
    }

    // Partial answer: keep the assistant's text but drop only the orphan
    // tool_calls and their unmatched tool messages.
    const keepIds = new Set(segment.toolCallIds.filter((id) => respondedIds.has(id)));
    assistantMutations.set(segment.assistantIndex, {
      toolCalls: assistant.toolCalls.filter((tc) => keepIds.has(tc.id)),
    });
    const orphanIdSet = new Set(orphanIds);
    for (const toolIndex of segment.toolIndices) {
      const toolCallId = history[toolIndex]?.toolCallId;
      if (typeof toolCallId === 'string' && orphanIdSet.has(toolCallId)) {
        indicesToRemove.add(toolIndex);
      }
    }
  }

  const out: T[] = [];
  for (let i = 0; i < history.length; i++) {
    if (indicesToRemove.has(i)) continue;
    const mutation = assistantMutations.get(i);
    if (mutation !== undefined) {
      const message = history[i];
      if (message !== undefined) {
        out.push({ ...message, toolCalls: mutation.toolCalls });
      }
    } else {
      out.push(history[i]!);
    }
  }

  return out.filter((message) => {
    return !(
      message.role === 'assistant' &&
      message.content.length === 0 &&
      message.toolCalls.length === 0
    );
  });
}

export function trimTrailingOpenToolExchange(history: readonly Message[]): Message[] {
  return trimOrphanToolExchanges(history);
}
