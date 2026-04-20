import { envSchema } from './env.validation';

export default (): Record<string, unknown> => {
  const parsed = envSchema.parse(process.env);
  return {
    port: parsed.PORT,
    mongoUri: parsed.MONGODB_URI,
    discogsToken: parsed.DISCOGS_USER_TOKEN,
    discogsSeedTarget: parsed.DISCOGS_SEED_TARGET,
    azureOpenAI: {
      endpoint: parsed.AZURE_OPENAI_ENDPOINT,
      apiKey: parsed.AZURE_OPENAI_API_KEY,
      apiVersion: parsed.AZURE_OPENAI_API_VERSION,
      responsesApiVersion: parsed.AZURE_OPENAI_RESPONSES_API_VERSION,
      chatDeployment: parsed.AZURE_OPENAI_CHAT_DEPLOYMENT,
      embeddingsDeployment: parsed.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT,
      ttsDeployment: parsed.AZURE_OPENAI_TTS_DEPLOYMENT,
      ttsEndpoint: parsed.AZURE_OPENAI_TTS_ENDPOINT,
      ttsApiKey: parsed.AZURE_OPENAI_TTS_API_KEY,
      ttsApiVersion: parsed.AZURE_OPENAI_TTS_API_VERSION,
    },
  };
};
