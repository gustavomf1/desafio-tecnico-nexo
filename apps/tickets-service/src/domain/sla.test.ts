import { describe, expect, it } from 'vitest';
import { addBusinessHours, computeDueAt, slaFor } from './sla.js';

const brt = (iso: string) => new Date(`${iso}-03:00`);

describe('addBusinessHours', () => {
    it('soma dentro do mesmo expediente', () => {
        expect(addBusinessHours(brt('2026-10-26T09:00:00'), 4)).toEqual(brt('2026-10-26T13:00:00'));
    });
        
    it('passa o que sobra para o próximo dia útil às 8h', () => {
        expect(addBusinessHours(brt('2026-10-26T16:00:00'), 4)).toEqual(brt('2026-10-27T10:00:00'));
    });
        
    it('pula o fim de semana', () => {
        expect(addBusinessHours(brt('2026-10-30T17:00:00'), 4)).toEqual(brt('2026-11-02T11:00:00'));
    });
        
    it('chamado aberto fora do expediente começa a contar no próximo expediente', () => {
        expect(addBusinessHours(brt('2026-10-31T22:00:00'), 4)).toEqual(brt('2026-11-02T12:00:00'));
        expect(addBusinessHours(brt('2026-10-27T06:30:00'), 1)).toEqual(brt('2026-10-27T09:00:00'));
    });
});

describe('computeDueAt', () => {
    it('média vale 3 dias úteis', () => {
        expect(computeDueAt('media', brt('2026-10-26T10:00:00'))).toEqual(brt('2026-10-29T10:00:00'));
    });
    
    it('crítica conta 1 hora corrida, mesmo de madrugada (plantão 24h)', () => {
        expect(computeDueAt('critica', brt('2026-10-31T03:00:00'))).toEqual(brt('2026-10-31T04:00:00'));
    });
});

describe('slaFor', () => {
    const ticket = { priority: 'media' as const, slaStartedAt: brt('2026-10-19T10:00:00') };
    
    it('marca vencido quando passou do prazo e o chamado está aberto', () => {
    expect(slaFor({ ...ticket, status: 'aguardando_analista' }, brt('2026-10-27T10:00:00')).overdue).toBe(true);
    });

    it('chamado resolvido nunca está vencido', () => {
    expect(slaFor({ ...ticket, status: 'resolvido' }, brt('2026-10-27T10:00:00')).overdue).toBe(false);
    });
});
