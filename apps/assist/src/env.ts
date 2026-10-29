import { z } from 'zod';

const schema = z.object({
  OPENAI_API_KEY: z.string().min(10),
  ASSIST_MODEL: z.string().default('openai/gpt-4.1-mini'),
  TICKETS_URL: z.string().url(),
  TICKETS_SERVICE_TOKEN: z.string().min(8),
});

export type AssistEnv = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AssistEnv {
  return schema.parse(source);
}
