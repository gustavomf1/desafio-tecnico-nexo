'use client';

import { AlertTriangle, Check, ChevronDown, RotateCw, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { sentenceCase } from '@/lib/format';
import type { DecisionTrace } from '@/lib/types';

function confidenceTone(value: number) {
  if (value >= 0.75) return 'tone-success';
  if (value >= 0.5) return 'tone-warning';
  return 'tone-danger';
}

export function AgentStatusLine({ trace, authorName = 'Nexo Assist', defaultOpen = false }: { trace: DecisionTrace | null; authorName?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasDetails = trace && (trace.decision || trace.steps.length > 0 || trace.guardrails.length > 0);

  return (
    <div className="trace">
      <div className="status-line">
        <span className="who">{authorName}</span>
        {trace?.steps.map((step, i) => (
          <span key={i} className={`step ${step.ok ? '' : 'failed'}`}>
            {step.ok ? <Check size={12} /> : <X size={12} />}
            {sentenceCase(step.label)}
          </span>
        ))}
        {hasDetails && (
          <button type="button" className={`why ${open ? 'open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            por quê?
            <ChevronDown size={12} />
          </button>
        )}
      </div>
      {open && trace && <TraceDetails trace={trace} />}
    </div>
  );
}

export function TraceDetails({ trace }: { trace: DecisionTrace }) {
  const { decision } = trace;
  const guardrails = trace.guardrails.filter((g) => !g.startsWith('O modelo não registrou'));
  return (
    <div className="trace-details">
      {decision ? (
        <dl className="decision">
          <dt>Entendeu</dt>
          <dd>{decision.intent}</dd>
          <dt>Decidiu</dt>
          <dd>{decision.action}</dd>
          <dt>Segurança</dt>
          <dd className={`confidence ${confidenceTone(decision.confidence)}`}>
            <span className="bar">
              <span style={{ width: `${Math.round(decision.confidence * 100)}%` }} />
            </span>
            {Math.round(decision.confidence * 100)}%
          </dd>
          <dt>Por quê</dt>
          <dd>{decision.reason}</dd>
        </dl>
      ) : (
        <p className="muted no-decision">O assistente não declarou a decisão nesta resposta; abaixo estão as ações que ele executou.</p>
      )}

      {trace.steps.length > 0 && (
        <div className="section">
          <span className="section-title">Ações</span>
          <ol className="steps">
            {trace.steps.map((step, i) => (
              <li key={i} className={step.ok ? '' : 'failed'}>
                {step.ok ? <Check size={13} /> : <X size={13} />}
                <span>
                  <strong>{step.label}</strong> · {step.summary}
                </span>
                <span className="meta mono">
                  {step.retries > 0 && (
                    <span className="retry" title="O sistema de chamados ficou indisponível e a chamada foi repetida">
                      <RotateCw size={11} /> {step.retries}
                    </span>
                  )}
                  {step.durationMs} ms
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {guardrails.length > 0 && (
        <div className="section">
          <span className="section-title">Regras do service desk aplicadas</span>
          <ul className="guardrails">
            {guardrails.map((g, i) => (
              <li key={i}>
                {g.startsWith('Bloqueado') ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="trace-meta mono">
        {trace.model} · {trace.usage ? `${trace.usage.inputTokens + trace.usage.outputTokens} tokens` : 'sem chamada ao modelo'} · {(trace.durationMs / 1000).toFixed(1)} s
      </div>
    </div>
  );
}
