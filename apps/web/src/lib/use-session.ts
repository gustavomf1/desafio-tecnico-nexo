'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getSession } from './api';
import type { User } from './types';

export function useSession(role: User['role']): { user: User | null; logout: () => void } {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    if (session.user.role !== role) {
      router.replace(session.user.role === 'analista' ? '/console' : '/');
      return;
    }
    setUser(session.user);
  }, [router, role]);

  return {
    user,
    logout: () => {
      clearSession();
      router.replace('/login');
    },
  };
}
