'use client';

import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { initials } from '@/lib/format';
import type { User } from '@/lib/types';
import { NexoMark } from './logo';

export type NavItem = { href: string; label: string; icon: ReactNode; count?: number };

export function Sidebar({ user, items, onLogout }: { user: User; items: NavItem[]; onLogout: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="logo">
        <NexoMark />
        Nexo Assist
      </div>
      <nav className="nav">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}>
            {item.icon}
            {item.label}
            {item.count ? <span className="nav-count">{item.count}</span> : null}
          </Link>
        ))}
      </nav>
      <div className="sidebar-user">
        <div className="avatar">{initials(user.name)}</div>
        <div style={{ minWidth: 0 }}>
          <div className="name">{user.name}</div>
          <div className="email">{user.email}</div>
        </div>
      </div>
      <div className="nav" style={{ marginTop: 4 }}>
        <button type="button" onClick={onLogout}>
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  );
}
