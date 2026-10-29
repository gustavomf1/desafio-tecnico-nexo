'use client';

import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { NexoMark } from '@/components/logo';
import { api, getSession, saveSession } from '@/lib/api';
import type { User } from '@/lib/types';
import './login.css';

const homeFor = (user: User) => (user.role === 'analista' ? '/console' : '/');

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (session) router.replace(homeFor(session.user));
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      saveSession(token, user, remember);
      router.replace(homeFor(user));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="showcase">
        <div className="brand">
          <NexoMark size={24} color="#ffffff" fg="#1B2431" />
          <span>Nexo Assist</span>
        </div>
        <div className="story">
          <div className="headline">
            <span className="eyebrow">Service desk de TI da Nexo</span>
            <h1>Seu problema de TI, resolvido em uma conversa.</h1>
            <p>Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista quando precisa.</p>
          </div>
          <div className="preview">
            <div className="preview-user">Meu notebook não conecta na VPN. Erro 809.</div>
            <div className="preview-agent">
              <div className="who">
                <strong>Nexo Assist</strong>
                <span>consultou seus chamados · criou um chamado</span>
              </div>
              <div className="bubble">Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.</div>
              <div className="chip">
                <span className="dot tone-warning" />
                <strong>INC-20517</strong>
                <span>Rede e VPN · Alta · em até 4 h</span>
              </div>
            </div>
          </div>
        </div>
        <div className="stats">
          <div>
            <strong>24 h</strong>
            <span>plantão para chamados críticos</span>
          </div>
          <div>
            <strong>8h–18h</strong>
            <span>atendimento de segunda a sexta</span>
          </div>
          <div>
            <strong>
              N1 · N2 <span className="dot tone-success" />
            </strong>
            <span>analistas no console</span>
          </div>
        </div>
      </section>

      <section className="sign-in">
        <div className="help">
          <span className="muted">Problema para entrar?</span>
          <a href="tel:4000">Ligue no ramal 4000</a>
        </div>
        <form className="form" onSubmit={submit}>
          <div>
            <h2>Entrar</h2>
            <p className="muted">Use seu e-mail corporativo e a senha da rede Nexo.</p>
          </div>
          <div className="fields">
            <label className="field">
              <span>E-mail corporativo</span>
              <div className="input">
                <Mail size={16} />
                <input type="email" required autoFocus autoComplete="username" placeholder="nome@nexo.com.br" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </label>
            <label className="field">
              <span>Senha</span>
              <div className="input">
                <Lock size={16} />
                <input type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Manter conectado neste computador
            </label>
          </div>
          {error && <div className="error-banner">{error}</div>}
          <button type="submit" className="btn btn-primary submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
            {!loading && <ArrowRight size={16} />}
          </button>
          <p className="note muted">
            Ambiente de demonstração: entre com <span className="mono">ana.souza@nexo.com.br</span> (funcionária) ou <span className="mono">rafael.lima@nexo.com.br</span> (analista), com qualquer senha.
          </p>
        </form>
        <footer className="footer muted">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </div>
  );
}
