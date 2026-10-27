import { sql } from 'drizzle-orm';
import { db, pool } from './client.js';
import { articles, employees, ticketUpdates, tickets } from './schema.js';
import type { Category, Priority, TicketStatus, TicketType, UpdateAuthor } from '../domain/types.js';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY - hours * 60 * 60 * 1000);

await db.execute(sql`truncate ticket_updates, tickets, articles, employees restart identity cascade`); 

const people = await db
    .insert(employees)
    .values([
      { email: 'ana.souza@nexo.com.br', name: 'Ana Souza', department: 'Financeiro' },
      { email: 'carla.mendes@nexo.com.br', name: 'Carla Mendes', department: 'Comercial' },
      { email: 'bruno.tavares@nexo.com.br', name: 'Bruno Tavares', department: 'Logística' },
      { email: 'diego.ramos@nexo.com.br', name: 'Diego Ramos', department: 'Marketing' },
      { email: 'elisa.prado@nexo.com.br', name: 'Elisa Prado', department: 'Jurídico' },
      { email: 'rafael.lima@nexo.com.br', name: 'Rafael Lima', department: 'TI', role: 'analista', team: 'Suporte N2' },
      { email: 'juliana.costa@nexo.com.br', name: 'Juliana Costa', department: 'TI', role: 'analista', team: 'Suporte N1' },
    ])
    .returning();

  const byEmail = (prefix: string) => {
    const p = people.find((e) => e.email.startsWith(prefix));
    if (!p) throw new Error(`seed: funcionário ${prefix} não existe`);
    return p.id;
};

await db.insert(articles).values([
  {
    id: 'KB-001',
    category: 'Rede e VPN',
    title: 'VPN com erro 809',
    body: 'Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.',
  },
  {
    id: 'KB-002',
    category: 'Outros',
    title: 'Horário do service desk',
    body: 'De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.',
  },
  {
    id: 'KB-003',
    category: 'Acesso',
    title: 'Trocar ou redefinir a senha da rede',
    body: 'Acesse senha.nexo.com.br, confirme o código enviado ao seu celular cadastrado e escolha a nova senha. A senha da rede vale para e-mail, VPN e Wi-Fi. Se o celular cadastrado mudou, abra um chamado de Acesso.',
  },
  {
    id: 'KB-004',
    category: 'Acesso',
    title: 'Senha do SAP bloqueada',
    body: 'O SAP bloqueia o usuário após 3 tentativas erradas. Use "Desbloquear usuário" no portal de autoatendimento e aguarde 15 minutos. Se continuar bloqueado, abra um chamado de Acesso.',
  },
  {
    id: 'KB-005',
    category: 'E-mail',
    title: 'Configurar o Outlook no celular',
    body: 'Instale o Portal da Empresa (Intune) e depois o app Outlook. Entre com o e-mail corporativo. O app de e-mail nativo do celular não é suportado.',
  },
  {
    id: 'KB-006',
    category: 'Rede e VPN',
    title: 'Wi-Fi corporativo e de visitantes',
    body: 'A rede Nexo-Corp usa o e-mail e a senha da rede. Visitantes usam a rede Nexo-Guest, com senha diária disponível na recepção.',
  },
  {
    id: 'KB-007',
    category: 'Software',
    title: 'Instalar um software',
    body: 'Softwares do catálogo são instalados pelo portal de softwares, sem chamado. Para um software fora do catálogo, abra uma requisição de Software com a justificativa; ela precisa da aprovação do seu gestor.',
  },
  {
    id: 'KB-008',
    category: 'Hardware',
    title: 'Notebook lento',
    body: 'Reinicie o notebook e rode o diagnóstico "Nexo Check" pelo portal de softwares. Se a lentidão continuar, abra um chamado de Hardware informando quando começou.',
  },
]);

type SeedTicket = {
  code: string;
  type: TicketType;
  category: Category;
  subcategory?: string;
  priority: Priority;
  status: TicketStatus;
  title: string;
  description: string;
  affected: string;
  owner: string;
  createdDaysAgo: number;
  slaDaysAgo: number;
  resolvedDaysAgo?: number;
  updates: Array<{ author: UpdateAuthor; authorName: string; body: string; daysAgo: number }>;
};

const seedTickets: SeedTicket[] = [
  {
    code: 'INC-20311',
    type: 'INC',
    category: 'Hardware',
    subcategory: 'Notebook',
    priority: 'media',
    status: 'aguardando_analista',
    title: 'Notebook lento após atualização do Windows',
    description: 'Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.',
    affected: 'Somente o solicitante',
    owner: 'ana.souza',
    createdDaysAgo: 6,
    slaDaysAgo: 6,
    updates: [{ author: 'sistema', authorName: 'Nexo Assist', body: 'Chamado aberto por Ana Souza.', daysAgo: 6 }],
  },
  {
    code: 'INC-20298',
    type: 'INC',
    category: 'Acesso',
    subcategory: 'SharePoint',
    priority: 'media',
    status: 'em_andamento',
    title: 'Acesso à pasta Financeiro no SharePoint',
    description: 'Sem permissão para abrir a pasta Financeiro > Fechamento no SharePoint desde a troca de equipe.',
    affected: 'Somente o solicitante',
    owner: 'ana.souza',
    createdDaysAgo: 13,
    slaDaysAgo: 1,
    updates: [
      { author: 'sistema', authorName: 'Nexo Assist', body: 'Chamado aberto por Ana Souza.', daysAgo: 13 },
      { author: 'analista', authorName: 'Juliana Costa', body: 'Pedido de aprovação enviado ao dono da pasta.', daysAgo: 1 },
    ],
  },
  {
    code: 'REQ-10442',
    type: 'REQ',
    category: 'Hardware',
    subcategory: 'Monitor',
    priority: 'baixa',
    status: 'aprovado',
    title: 'Segundo monitor para home office',
    description: 'Solicito um segundo monitor para o home office, para trabalhar com planilhas lado a lado.',
    affected: 'Somente o solicitante',
    owner: 'ana.souza',
    createdDaysAgo: 18,
    slaDaysAgo: 3,
    updates: [{ author: 'analista', authorName: 'Juliana Costa', body: 'Aprovado pelo gestor. Aguardando entrega.', daysAgo: 3 }],
  },
  {
    code: 'INC-20150',
    type: 'INC',
    category: 'Acesso',
    subcategory: 'SAP',
    priority: 'media',
    status: 'resolvido',
    title: 'Senha do SAP bloqueada',
    description: 'Usuário do SAP bloqueado após tentativas erradas de senha.',
    affected: 'Somente o solicitante',
    owner: 'ana.souza',
    createdDaysAgo: 5,
    slaDaysAgo: 5,
    resolvedDaysAgo: 4,
    updates: [{ author: 'analista', authorName: 'Rafael Lima', body: 'Usuário desbloqueado no SAP.', daysAgo: 4 }],
  },
  {
    code: 'INC-19877',
    type: 'INC',
    category: 'E-mail',
    priority: 'baixa',
    status: 'resolvido',
    title: 'Outlook não sincroniza no celular',
    description: 'O Outlook do celular parou de receber e-mails.',
    affected: 'Somente o solicitante',
    owner: 'ana.souza',
    createdDaysAgo: 57,
    slaDaysAgo: 57,
    resolvedDaysAgo: 55,
    updates: [{ author: 'analista', authorName: 'Juliana Costa', body: 'Perfil do Intune recriado.', daysAgo: 55 }],
  },
  {
    code: 'INC-20405',
    type: 'INC',
    category: 'Acesso',
    subcategory: 'SAP',
    priority: 'alta',
    status: 'aberto',
    title: 'Sem acesso ao SAP',
    description: 'Preciso de acesso ao SAP ainda hoje para fechar pedidos de clientes.',
    affected: 'Somente o solicitante',
    owner: 'carla.mendes',
    createdDaysAgo: 0,
    slaDaysAgo: 0,
    updates: [],
  },
  {
    code: 'INC-20388',
    type: 'INC',
    category: 'Rede e VPN',
    priority: 'alta',
    status: 'em_andamento',
    title: 'VPN caindo a cada 10 minutos',
    description: 'A VPN desconecta sozinha a cada 10 minutos desde segunda.',
    affected: 'Somente o solicitante',
    owner: 'bruno.tavares',
    createdDaysAgo: 2,
    slaDaysAgo: 1,
    updates: [],
  },
  {
    code: 'INC-20410',
    type: 'INC',
    category: 'Hardware',
    subcategory: 'Impressora',
    priority: 'media',
    status: 'aberto',
    title: 'Impressora do 3º andar não imprime',
    description: 'A impressora do 3º andar recebe os trabalhos mas não imprime.',
    affected: 'Equipe de Logística',
    owner: 'bruno.tavares',
    createdDaysAgo: 2,
    slaDaysAgo: 2,
    updates: [],
  },
  {
    code: 'REQ-10450',
    type: 'REQ',
    category: 'Software',
    priority: 'baixa',
    status: 'aberto',
    title: 'Licença do Adobe Illustrator',
    description: 'Preciso do Illustrator para as peças da campanha de fim de ano.',
    affected: 'Somente o solicitante',
    owner: 'diego.ramos',
    createdDaysAgo: 1,
    slaDaysAgo: 1,
    updates: [],
  },
];

for (const t of seedTickets) {
  const { owner, createdDaysAgo, slaDaysAgo, resolvedDaysAgo, updates, ...fields } = t;
  const lastActivity = Math.min(createdDaysAgo, slaDaysAgo, resolvedDaysAgo ?? Infinity, ...updates.map((u) => u.daysAgo));
  const [row] = await db
    .insert(tickets)
    .values({
      ...fields,
      subcategory: fields.subcategory ?? null,
      requesterId: byEmail(owner),
      createdAt: ago(createdDaysAgo),
      updatedAt: ago(lastActivity),
      slaStartedAt: ago(slaDaysAgo),
      resolvedAt: resolvedDaysAgo === undefined ? null : ago(resolvedDaysAgo),
    })
    .returning();
  for (const u of updates) {
    await db.insert(ticketUpdates).values({ ticketId: row!.id, author: u.author, authorName: u.authorName, body: u.body, createdAt: ago(u.daysAgo) });
  }
}

console.log(`seed: ${people.length} pessoas, 8 artigos, ${seedTickets.length} chamados`);
await pool.end();