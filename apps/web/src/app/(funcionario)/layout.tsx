'use client';

import { MessageSquare, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmployeeContext } from '@/components/employee-context';
import { Sidebar } from '@/components/sidebar';
import { useSession } from '@/lib/use-session';

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useSession('funcionario');
  if (!user) return null;
  return (
    <EmployeeContext.Provider value={{ user, logout }}>
      <div className="shell">
        <Sidebar
          user={user}
          onLogout={logout}
          items={[
            { href: '/', label: 'Atendimento', icon: <MessageSquare size={16} /> },
            { href: '/perfil', label: 'Meu perfil', icon: <UserRound size={16} /> },
          ]}
        />
        <main className="main">{children}</main>
      </div>
    </EmployeeContext.Provider>
  );
}
