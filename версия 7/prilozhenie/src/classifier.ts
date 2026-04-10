import path from 'path';

export const CATEGORIES = [
  'Учёба',
  'Работа',
  'Финансы',
  'Личные документы',
  'Изображения',
  'Прочее',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface FileLike {
  originalname: string;
}

function extractKeywords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[_\-\.]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

export function classifyDocument(
  file: FileLike,
): { category: Category; keywords: string } {
  const original = file.originalname;
  const ext = (path.extname(original) || '').toLowerCase();
  const name = original.toLowerCase();
  const keywords = extractKeywords(original);

  const has = (substrs: string[]) => substrs.some((s) => name.includes(s));

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
    return { category: 'Изображения', keywords: keywords.join(', ') };
  }

  if (has(['универ', 'университет', 'курс', 'лекц', 'семинар', 'задание', 'дз', 'контрольная'])) {
    return { category: 'Учёба', keywords: keywords.join(', ') };
  }

  if (has(['отчёт', 'отчет', 'presentation', 'report', 'task', 'project'])) {
    return { category: 'Работа', keywords: keywords.join(', ') };
  }

  if (
    ['.xls', '.xlsx', '.csv'].includes(ext) ||
    has(['счёт', 'счет', 'invoice', 'bill', 'оплата', 'платёж', 'платеж'])
  ) {
    return { category: 'Финансы', keywords: keywords.join(', ') };
  }

  if (
    has([
      'паспорт',
      'загран',
      'водитель',
      'права',
      'свидетельство',
      'страховка',
      'полис',
      'snils',
      'inn',
    ])
  ) {
    return { category: 'Личные документы', keywords: keywords.join(', ') };
  }

  return { category: 'Прочее', keywords: keywords.join(', ') };
}
