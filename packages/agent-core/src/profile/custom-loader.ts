import { readdir, readFile } from 'node:fs/promises';
import { join } from 'pathe';

import { DEFAULT_INIT_PROMPT, DEFAULT_PROFILE_PATHS, PROFILE_SOURCES } from './default';
import { loadAgentProfilesFromSources } from './load';
import type { ResolvedAgentProfile } from './types';

export async function loadCustomAgentProfiles(
  dir: string,
): Promise<{ profiles: Record<string, ResolvedAgentProfile>; initPrompt: string }> {
  const entries = await readdir(dir, { withFileTypes: true });
  const customSources: Record<string, string> = {};
  const customPaths: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.endsWith('.yaml')) {
      const baseName = name.slice(0, -5);
      if (!['agent', 'coder', 'explore', 'plan'].includes(baseName)) continue;
      const content = await readFile(join(dir, name), 'utf-8');
      const sourcePath = `profile/default/${name}`;
      customSources[sourcePath] = content;
      customPaths.push(sourcePath);
    } else if (name.endsWith('.md') && name !== 'init.md') {
      const content = await readFile(join(dir, name), 'utf-8');
      const sourcePath = `profile/default/${name}`;
      customSources[sourcePath] = content;
    }
  }

  const mergedSources = { ...PROFILE_SOURCES, ...customSources };
  const allPaths = [...new Set([...DEFAULT_PROFILE_PATHS, ...customPaths])];

  const profiles = loadAgentProfilesFromSources(allPaths, mergedSources);

  let initPrompt = DEFAULT_INIT_PROMPT;
  const hasInit = entries.some((entry) => entry.isFile() && entry.name === 'init.md');
  if (hasInit) {
    initPrompt = await readFile(join(dir, 'init.md'), 'utf-8');
  }

  return { profiles, initPrompt };
}
