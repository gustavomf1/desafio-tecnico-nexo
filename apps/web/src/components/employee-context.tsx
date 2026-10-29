'use client';

import { createContext, useContext } from 'react';
import type { User } from '@/lib/types';

export const EmployeeContext = createContext<{ user: User; logout: () => void } | null>(null);

export function useEmployee() {
  const ctx = useContext(EmployeeContext);
  if (!ctx) throw new Error('useEmployee fora do layout do funcionário');
  return ctx;
}
