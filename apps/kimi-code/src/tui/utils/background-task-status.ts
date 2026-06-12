/**
 * Format a `BackgroundTaskInfo` snapshot into the transcript card data
 * consumed by `BackgroundAgentStatusComponent`.
 *
 * Background tasks have several statuses (running / completed / failed /
 * timed_out / killed / lost) but the transcript card only renders three
 * visual phases (started / completed / failed). The
 * mapping packs the extra nuance — exit code, kill reason, lost-reason
 * — into the dim detail line so the user still sees it.
 */

import type { BackgroundTaskInfo, BackgroundTaskStatus } from '@moonshot-ai/kimi-code-sdk';

import type { BackgroundAgentStatusData, BackgroundAgentStatusPhase } from '@/tui/types';

import { currentTheme } from '#/tui/theme';

const MAX_DETAIL_LENGTH = 240;

function truncate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const collapsed = value.trim().replaceAll(/\s+/g, ' ');
  if (collapsed.length === 0) return undefined;
  if (collapsed.length <= MAX_DETAIL_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_DETAIL_LENGTH - 3)}...`;
}

export type BackgroundTaskTranscriptPhase = 'started' | 'updated' | 'terminal';

function phaseFromStatus(status: BackgroundTaskStatus): BackgroundAgentStatusPhase {
  switch (status) {
    case 'running':
      return 'started';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'timed_out':
    case 'killed':
    case 'lost':
      return 'failed';
  }
}

function subjectFor(info: BackgroundTaskInfo): string {
  if (info.kind === 'agent') return 'agent task';
  if (info.kind === 'question') return 'question task';
  return 'bash task';
}

function headlineFor(info: BackgroundTaskInfo): string {
  const subject = subjectFor(info);
  switch (info.status) {
    case 'running':
      return `${subject} started in background`;
    case 'completed':
      return `${subject} completed in background`;
    case 'failed':
      return `${subject} failed in background`;
    case 'timed_out':
      return `${subject} timed out`;
    case 'killed':
      return `${subject} stopped`;
    case 'lost':
      return `${subject} lost`;
  }
}

function detailFor(info: BackgroundTaskInfo): string | undefined {
  const parts: string[] = [];
  const description = truncate(info.description);
  if (description !== undefined) parts.push(description);

  if (info.status === 'completed' || info.status === 'failed') {
    if (info.kind === 'process' && info.exitCode !== null) {
      parts.push(`exit ${info.exitCode}`);
    }
  }
  if (info.status === 'killed') {
    const reason = truncate(info.stopReason);
    parts.push(reason !== undefined ? `stopped — ${reason}` : 'stopped');
  }
  if (info.status === 'failed') {
    const reason = truncate(info.stopReason);
    if (reason !== undefined) parts.push(reason);
  }
  if (info.status === 'timed_out') parts.push('timed out');
  if (info.status === 'lost') {
    parts.push('session restarted before completion');
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * Build a transcript card payload for a background task lifecycle
 * snapshot. The returned phase drives bullet color in the renderer
 * (`BackgroundAgentStatusComponent`); the detail line carries the extra
 * status nuance (exit code, kill reason, etc.).
 */
export function formatBackgroundTaskTranscript(
  info: BackgroundTaskInfo,
): BackgroundAgentStatusData {
  return {
    phase: phaseFromStatus(info.status),
    headline: headlineFor(info),
    detail: detailFor(info),
  };
}

/**
 * Format a single line from a subagent background task's log stream
 * to match the formatting/styling of the main agent transcript.
 */
export function formatSubagentLogLine(
  line: string,
  state: { inThinking: boolean },
): string | undefined {
  const trimmed = line.trim();
  if (trimmed === '<thinking>') {
    state.inThinking = true;
    return currentTheme.dim('◌ ') + currentTheme.italicFg('textDim', 'Thinking...');
  }
  if (trimmed === '</thinking>') {
    state.inThinking = false;
    return undefined;
  }
  if (state.inThinking) {
    return currentTheme.italicFg('textDim', line);
  }

  // Turn events
  let match = /^\[turn (\d+) started\]$/.exec(line);
  if (match) {
    const turnId = match[1];
    return currentTheme.fg('primary', '● ') + currentTheme.boldFg('textStrong', `Turn ${turnId} started`);
  }

  match = /^\[turn (\d+) ended: (.*)\]$/.exec(line);
  if (match) {
    const turnId = match[1];
    const reason = match[2];
    return currentTheme.fg('success', '● ') + currentTheme.fg('textMuted', `Turn ${turnId} ended: ${reason}`);
  }

  // Tool events
  match = /^\[tool\] ([a-zA-Z0-9_\-\.]+)\((.*)\)$/.exec(line);
  if (match) {
    const name = match[1];
    const args = match[2];
    return (
      currentTheme.dim('◌ ') +
      'Using ' +
      currentTheme.boldFg('primary', name) +
      currentTheme.dim(`(${args})`)
    );
  }

  match = /^\[result\] ([a-zA-Z0-9_\-\.:]+): (.*)$/.exec(line);
  if (match) {
    const preview = match[2];
    return currentTheme.fg('success', '  • ') + currentTheme.dim(`Result: ${preview}`);
  }

  // Error events
  match = /^\[error\] (.*)$/.exec(line);
  if (match) {
    const errorMsg = match[1];
    return currentTheme.fg('error', '✗ ') + currentTheme.fg('error', errorMsg);
  }

  // Normal text / assistant response
  return line;
}

/**
 * Format a set of lines from a subagent background task's log stream.
 */
export function formatSubagentLogLines(lines: string[]): string[] {
  const state = { inThinking: false };
  const result: string[] = [];
  for (const line of lines) {
    const formatted = formatSubagentLogLine(line, state);
    if (formatted !== undefined) {
      result.push(formatted);
    }
  }
  return result;
}
