'use client';

import { LogOut, MessagesSquare } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmployeeContext } from '@/components/employee-context';
import { NexoMark } from '@/components/logo';
import { initials } from '@/lib/format';
import { useSession } from '@/lib/use-session';
import './console.css';

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useSession('analista');
  if (!user) return null;
  return (
    <EmployeeContext.Provider value={{ user, logout }}>
      <div className="console">
        <nav className="rail">
          <div className="rail-logo">
            <NexoMark size={22} />
          </div>
          <span className="rail-item active" title="Conversas">
            <MessagesSquare size={19} />
          </span>
          <span className="rail-spacer" />
          <button type="button" className="rail-item" title="Sair" onClick={logout}>
            <LogOut size={17} />
          </button>
          <span className="rail-me" title={`${user.name} · ${user.team ?? 'Service desk'}`}>
            {initials(user.name)}
            <span className="online" />
          </span>
        </nav>
        {children}
      </div>
    </EmployeeContext.Provider>
  );
}
