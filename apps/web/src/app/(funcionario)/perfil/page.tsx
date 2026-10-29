'use client';

import { ChevronRight, Info, KeyRound, ShieldCheck } from 'lucide-react';
import { useEmployee } from '@/components/employee-context';

export default function ProfilePage() {
  const { user } = useEmployee();
  const rows = [
    { key: 'Nome', value: user.name },
    { key: 'E-mail corporativo', value: user.email, note: 'Gerenciado pela TI' },
    { key: 'Área', value: user.department },
  ];
  return (
    <>
      <header className="topbar">
        <div className="breadcrumb">
          Service desk de TI <ChevronRight size={14} /> <strong>Meu perfil</strong>
        </div>
      </header>
      <div style={{ padding: '48px 40px', overflowY: 'auto' }}>
        <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div>
            <h1 style={{ margin: '0 0 6px', fontSize: 24 }}>Meu perfil</h1>
            <span className="muted">Seus dados de acesso ao service desk de TI.</span>
          </div>
          <div className="card">
            {rows.map((row, i) => (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 24px', borderTop: i ? '1px solid var(--rule)' : undefined }}>
                <span className="muted" style={{ width: 160, fontSize: 13.5 }}>
                  {row.key}
                </span>
                <span style={{ flex: 1, fontWeight: 500 }}>{row.value}</span>
                {row.note && (
                  <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                    <ShieldCheck size={13} /> {row.note}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 24 }}>
              <div className="avatar" style={{ width: 40, height: 40, background: 'var(--desk)', color: 'var(--ink-2)' }}>
                <KeyRound size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>Senha</div>
                <div className="muted" style={{ fontSize: 13.5 }}>
                  A mesma da rede Nexo
                </div>
              </div>
              <button type="button" className="btn btn-outline" disabled title="Demonstração: a senha é gerenciada pela TI">
                Redefinir senha
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 24px', background: 'var(--desk)', borderTop: '1px solid var(--rule)', fontSize: 13 }} className="muted">
              <Info size={14} /> Para trocar a senha, peça ao Nexo Assist: ele mostra o passo a passo da central de ajuda.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
