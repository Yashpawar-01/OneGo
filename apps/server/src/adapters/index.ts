import {
  AnthropicAdapter,
  OpenAiAdapter,
  ProviderAdapterRegistry,
} from "@onego/core";
import { CopilotAdapter } from "./copilot.js";
import { QoderCliAdapter } from "./qoder-cli.js";

export type AdapterRegistryOptions = {
  openAiBaseUrl?: string;
  anthropicBaseUrl?: string;
  qoderCliPath?: string;
  qoderDefaultModel?: string;
  copilotWorkingDirectory?: string;
};

export function createAdapterRegistry(
  options: AdapterRegistryOptions = {},
): ProviderAdapterRegistry {
  const registry = new ProviderAdapterRegistry();

  registry.register(
    new OpenAiAdapter({
      baseUrl:
        options.openAiBaseUrl ?? process.env.ONEGO_OPENAI_BASE_URL ?? undefined,
    }),
    { priority: 10 },
  );
  registry.register(
    new AnthropicAdapter({
      baseUrl:
        options.anthropicBaseUrl ?? process.env.ONEGO_ANTHROPIC_BASE_URL ?? undefined,
    }),
    { priority: 20 },
  );
  registry.register(
    new CopilotAdapter({
      workingDirectory:
        options.copilotWorkingDirectory ?? process.env.ONEGO_COPILOT_WORKDIR,
    }),
    { priority: 30 },
  );
  registry.register(
    new QoderCliAdapter({
      executable: options.qoderCliPath ?? process.env.ONEGO_QODER_CLI_PATH,
      defaultModel: options.qoderDefaultModel ?? process.env.ONEGO_QODER_DEFAULT_MODEL,
    }),
    { priority: 40 },
  );

  return registry;
}

export { CopilotAdapter, QoderCliAdapter };
