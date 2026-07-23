/**
 * `agentProfileCatalog` domain (L3) — load custom YAML agent profiles from directory.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

import type { AgentProfile } from './agentProfileCatalog';
import { registerAgentProfile } from './contribution';
import { renderSystemPrompt } from './profile-shared';

export interface YamlAgentProfileSpec {
  readonly name: string;
  readonly extends?: string;
  readonly description?: string;
  readonly whenToUse?: string;
  readonly thinking_level?: string;
  readonly model?: string;
  readonly model_alias?: string;
  readonly systemPromptPath?: string;
  readonly promptVars?: Record<string, string>;
  readonly tools?: readonly string[];
}

export function loadAgentProfilesFromDir(agentDir: string): void {
  if (!fs.existsSync(agentDir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(agentDir, { withFileTypes: true });
  } catch {
    return;
  }

  const rawProfiles = new Map<string, YamlAgentProfileSpec>();

  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
      const filePath = path.join(agentDir, entry.name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = yaml.load(content) as YamlAgentProfileSpec;
        if (parsed && typeof parsed.name === 'string' && parsed.name.length > 0) {
          rawProfiles.set(parsed.name, parsed);
        }
      } catch {
        // Skip unparseable profile files silently
      }
    }
  }

  for (const [name, config] of rawProfiles.entries()) {
    const parentConfig = config.extends ? rawProfiles.get(config.extends) : undefined;
    const mergedTools = config.tools ?? parentConfig?.tools ?? [];
    const mergedPromptVars = {
      ...parentConfig?.promptVars,
      ...config.promptVars,
    };
    const thinkingLevel = config.thinking_level ?? parentConfig?.thinking_level;
    const model = config.model ?? config.model_alias ?? parentConfig?.model ?? parentConfig?.model_alias;

    const promptPath = config.systemPromptPath ?? parentConfig?.systemPromptPath;
    let basePromptTemplate = '';
    if (promptPath) {
      const resolvedPath = path.resolve(agentDir, promptPath);
      if (fs.existsSync(resolvedPath)) {
        try {
          basePromptTemplate = fs.readFileSync(resolvedPath, 'utf-8');
        } catch {
          basePromptTemplate = '';
        }
      }
    }

    const roleAdditional = mergedPromptVars.roleAdditional ?? '';
    const compiledPrompt = basePromptTemplate.replace(/\{\{\s*ROLE_ADDITIONAL\s*\}\}/g, roleAdditional);

    const profile: AgentProfile = {
      name,
      description: config.description ?? parentConfig?.description,
      whenToUse: config.whenToUse ?? parentConfig?.whenToUse,
      thinkingLevel,
      model,
      tools: mergedTools,
      systemPrompt: (context) => renderSystemPrompt(compiledPrompt, context, mergedTools),
    };

    registerAgentProfile(profile);
  }
}
