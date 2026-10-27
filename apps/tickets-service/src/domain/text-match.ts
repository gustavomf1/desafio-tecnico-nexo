const STOPWORDS = new Set(
  'a o as os de da do das dos e em no na nos nas um uma uns umas para pra por com sem que se meu minha meus minhas eu ele ela isso esse essa este esta ao aos nao mais ja esta estou tem ter foi ser como quando qual quais onde porque pq'.split(' '),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}


export function overlap(queryTokens: string[], docTokens: Set<string>): number {
  if (queryTokens.length === 0) return 0;
  const unique = [...new Set(queryTokens)];
  const hits = unique.filter((t) => docTokens.has(t) || [...docTokens].some((d) => sharesStem(t, d)));
  return hits.length / unique.length;
}


function sharesStem(a: string, b: string): boolean {
  return a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5);
}

export type Scored<T> = { item: T; score: number };

export function rankByText<T>(items: T[], query: string, textOf: (item: T) => string, limit: number): Scored<T>[] {
  const q = tokenize(query);
  return items
    .map((item) => ({ item, score: overlap(q, new Set(tokenize(textOf(item)))) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
