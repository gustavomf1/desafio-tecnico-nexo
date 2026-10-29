import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Employee } from './tickets/types.js';

export type SessionUser = Pick<Employee, 'id' | 'email' | 'name' | 'department' | 'role' | 'team'>;

type Payload = { user: SessionUser; exp: number };

const SESSION_HOURS = 12;

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest('base64url');

export function createSessionToken(user: SessionUser, secret: string, now = Date.now()): string {
  const payload: Payload = { user, exp: now + SESSION_HOURS * 60 * 60 * 1000 };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data, secret)}`;
}

export function readSessionToken(token: string, secret: string, now = Date.now()): SessionUser | null {
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as Payload;
  return payload.exp > now ? payload.user : null;
}
