export type AdminSettingsDto = {
  id: number;
  siteName: string;
  llmProvider: string;
  providerUrl: string;
  modelName: string;
  promptTemplate: string;
  hasApiKey: boolean;
  updatedAt: string;
};
