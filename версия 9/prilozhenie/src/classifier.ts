import path from 'path';

export const CATEGORIES = [
  'Учёба',
  'Работа',
  'Финансы',
  'Личные документы',
  'Изображения',
  'Музыка',
  'Видео',
  'Архивы',
  'Код',
  'Презентации',
  'Тексты',
  'Таблицы/Данные',
  'Установщики',
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

  // 🔥 Учёба проверяется первой, расширенный список слов
  if (has([
    'универ', 'университет', 'курс', 'курсовой', 'курсач',
    'лекц', 'семинар', 'задание', 'дз', 'контрольная',
    'лаба', 'лабораторная', 'зачет', 'зачёт', 'экзамен', 'экз'
  ])) {
    return { category: 'Учёба', keywords: keywords.join(', ') };
  }

  // Работа проверяется после
  if (has(['отчёт', 'отчет', 'presentation', 'report', 'task', 'project'])) {
    return { category: 'Работа', keywords: keywords.join(', ') };
  }

  if (['.xls', '.xlsx', '.csv'].includes(ext)) {
    return { category: 'Таблицы/Данные', keywords: keywords.join(', ') };
  }

  if (has(['счёт', 'счет', 'invoice', 'bill', 'оплата', 'платёж', 'платеж'])) {
    return { category: 'Финансы', keywords: keywords.join(', ') };
  }

  if (has([
    'паспорт', 'загран', 'водитель', 'права', 'свидетельство',
    'страховка', 'полис', 'snils', 'inn'
  ])) {
    return { category: 'Личные документы', keywords: keywords.join(', ') };
  }

  if (['.mp3', '.wav', '.flac'].includes(ext)) {
    return { category: 'Музыка', keywords: keywords.join(', ') };
  }

  if (['.mp4', '.avi', '.mkv', '.mov'].includes(ext)) {
    return { category: 'Видео', keywords: keywords.join(', ') };
  }

  if (['.zip', '.rar', '.7z'].includes(ext)) {
    return { category: 'Архивы', keywords: keywords.join(', ') };
  }

  if (['.js', '.ts', '.java', '.py', '.cpp', '.c', '.cs'].includes(ext)) {
    return { category: 'Код', keywords: keywords.join(', ') };
  }

  if (['.ppt', '.pptx'].includes(ext)) {
    return { category: 'Презентации', keywords: keywords.join(', ') };
  }

  if (['.txt', '.doc', '.docx', '.pdf'].includes(ext)) {
    return { category: 'Тексты', keywords: keywords.join(', ') };
  }

  if (['.exe', '.msi'].includes(ext)) {
    return { category: 'Установщики', keywords: keywords.join(', ') };
  }

  return { category: 'Прочее', keywords: keywords.join(', ') };
}
