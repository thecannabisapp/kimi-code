/**
 * Scenario: `loadAgentProfilesFromDir` loads YAML agent profiles into the
 * module-level contribution registry so the App-scope builtin loader sees them
 * at bootstrap time. Exercises the field mapping (name, description, model,
 * thinking_level) and the builtin-override behavior.
 * Run:
 * `pnpm --filter @moonshot-ai/agent-core-v2 exec vitest run
 * test/app/agentProfileCatalog/customDirLoader.test.ts`.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { join } from 'pathe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadAgentProfilesFromDir } from '#/app/agentProfileCatalog/customDirLoader';
import {
  _clearAgentProfileContributionsForTests,
  getAgentProfileContributions,
  registerAgentProfile,
} from '#/app/agentProfileCatalog/contribution';

describe('loadAgentProfilesFromDir', () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    _clearAgentProfileContributionsForTests();
    registerAgentProfile({
      name: 'agent',
      systemPrompt: () => 'default builtin profile',
    });
  });

  afterEach(async () => {
    _clearAgentProfileContributionsForTests();
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('loads a YAML profile with model and thinking_level into the contribution registry', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-profiles-'));
    await writeFile(
      join(tempDir, 'custom.yaml'),
      [
        'name: yaml-bound',
        'description: Custom YAML agent profile',
        'model: yaml-model',
        'thinking_level: high',
      ].join('\n'),
      'utf-8',
    );

    loadAgentProfilesFromDir(tempDir);

    const contributions = getAgentProfileContributions();
    const profile = contributions.find((candidate) => candidate.name === 'yaml-bound');
    expect(profile).toBeDefined();
    expect(profile).toMatchObject({
      name: 'yaml-bound',
      description: 'Custom YAML agent profile',
      model: 'yaml-model',
      thinkingLevel: 'high',
    });
  });

  it('lets a same-name YAML profile replace the builtin default', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-profiles-'));
    await writeFile(
      join(tempDir, 'agent.yaml'),
      [
        'name: agent',
        'description: Overridden default',
        'model: overridden-model',
        'thinking_level: low',
      ].join('\n'),
      'utf-8',
    );

    loadAgentProfilesFromDir(tempDir);

    const contributions = getAgentProfileContributions();
    const names = contributions.map((candidate) => candidate.name);
    expect(names.filter((name) => name === 'agent')).toHaveLength(1);
    const profile = contributions.find((candidate) => candidate.name === 'agent');
    expect(profile).toMatchObject({
      name: 'agent',
      description: 'Overridden default',
      model: 'overridden-model',
      thinkingLevel: 'low',
    });
  });
});
