import { z } from 'zod';

const schema = z.object({
    TICKETS_DATABASE_URL: z.string().url(),
    TICKETS_PORT: z.coerce.number().int().default(4001),
    TICKETS_FAULT_RATE: z.coerce.number().min(0).max(1).default(0.1),
    TICKETS_SERVICE_TOKEN: z.string().min(8),
});

export const env = schema.parse(process.env);

