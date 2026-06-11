import { sleep } from '@antfu/utils';

import type { AgentEvent } from '#/rpc';
import { errorMessage, isAbortError } from '../../loop/errors';
import {
  type BackgroundTask,
  type BackgroundTaskInfoBase,
  type BackgroundTaskSink,
} from './task';

export interface AgentBackgroundTaskInfo extends BackgroundTaskInfoBase {
  readonly kind: 'agent';
  /** Subagent identifier accepted by Agent(resume=...). */
  readonly agentId?: string;
  /** Subagent profile name. */
  readonly subagentType?: string;
}

export interface AgentBackgroundTaskOptions {
  readonly timeoutMs?: number;
  readonly abort?: () => void;
  readonly agentId?: string;
  readonly subagentType?: string;
  readonly eventSource?: ((callback: (event: AgentEvent) => void) => (() => void)) | undefined;
}

export class AgentBackgroundTask implements BackgroundTask {
  readonly kind = 'agent' as const;
  readonly idPrefix: string = 'agent';
  readonly timeoutMs?: number;
  readonly agentId?: string;
  readonly subagentType?: string;
  private readonly abort?: () => void;
  private readonly eventSource?: ((callback: (event: AgentEvent) => void) => (() => void)) | undefined;

  constructor(
    private readonly completion: Promise<{ result: string }>,
    readonly description: string,
    options: AgentBackgroundTaskOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs;
    this.abort = options.abort;
    this.agentId = options.agentId;
    this.subagentType = options.subagentType;
    this.eventSource = options.eventSource;
  }

  async start(sink: BackgroundTaskSink): Promise<void> {
    const requestAbort = (): void => {
      this.abort?.();
    };
    if (sink.signal.aborted) {
      requestAbort();
    } else {
      sink.signal.addEventListener('abort', requestAbort, { once: true });
    }

    const deadlineTimeout: unique symbol = Symbol('background-agent-deadline');
    const raceInputs: Array<Promise<{ result: string } | typeof deadlineTimeout>> = [
      this.completion,
    ];
    const timeoutMs = this.timeoutMs;

    if (timeoutMs !== undefined && timeoutMs > 0) {
      raceInputs.push(sleep(timeoutMs).then(() => deadlineTimeout));
    }

    let unsubscribeEvents: (() => void) | undefined;
    if (this.eventSource !== undefined) {
      unsubscribeEvents = this.eventSource((event) => {
        const line = formatAgentEvent(event);
        if (line !== undefined) {
          sink.appendOutput(line + '\n');
        }
      });
    }

    try {
      const outcome = await Promise.race(raceInputs);
      if (outcome === deadlineTimeout) {
        this.abort?.();
        await sink.settle({ status: 'timed_out' });
        return;
      }
      sink.appendOutput(outcome.result);
      await sink.settle({ status: 'completed' });
    } catch (error: unknown) {
      if (sink.signal.aborted && isAbortError(error)) {
        await sink.settle({ status: 'killed' });
        return;
      }
      await sink.settle({ status: 'failed', stopReason: errorMessage(error) });
    } finally {
      sink.signal.removeEventListener('abort', requestAbort);
      unsubscribeEvents?.();
    }
  }

  toInfo(base: BackgroundTaskInfoBase): AgentBackgroundTaskInfo {
    return {
      ...base,
      kind: 'agent',
      agentId: this.agentId,
      subagentType: this.subagentType,
    };
  }
}

function formatAgentEvent(event: AgentEvent): string | undefined {
  switch (event.type) {
    case 'turn.started':
      return `[turn ${event.turnId} started]`;
    case 'turn.ended':
      return `[turn ${event.turnId} ended: ${event.reason}]`;
    case 'tool.call.started': {
      const args = typeof event.args === 'string' ? event.args : JSON.stringify(event.args);
      const preview = args.length > 200 ? args.slice(0, 200) + '…' : args;
      return `[tool] ${event.name}(${preview})`;
    }
    case 'tool.result': {
      const output = typeof event.output === 'string' ? event.output : JSON.stringify(event.output);
      const preview = output.length > 200 ? output.slice(0, 200) + '…' : output;
      return `[result] ${event.toolCallId}: ${preview}`;
    }
    case 'error':
      return `[error] ${'message' in event ? String(event.message) : String(event)}`;
    default:
      return undefined;
  }
}
