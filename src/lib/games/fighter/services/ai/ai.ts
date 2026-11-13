import { createGateway } from '@ai-sdk/gateway';
import { env } from '$env/dynamic/private';

export const ai = createGateway({
  apiKey: env.AI_GATEWAY_API_KEY,
});
