const path = require('path');

const CATEGORIES = [
  'Учёба',
  'Работа',
  'Финансы',
  'Личные документы',
  'Изображения',
  'Прочее'
];

// Разбиваем имя файла на ключевые слова
function extractKeywords(name) {
  return name
    .toLowerCase()
    .replace(/[_\-\.]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
}

// Основная функция классификации
function classifyDocument(file) {
  const original = file.originalname;
  const ext = (path.extname(original) || '').toLowerCase();
  const name = original.toLowerCase();
  const keywords = extractKeywords(original);

  const has = substrs => substrs.some(s => name.includes(s));

  // Изображения
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
    return { category: 'Изображения', keywords: keywords.join(', ') };
  }

  // Учёба
  if (has(['универ', 'университет', 'курс', 'лекц', 'семинар', 'задание', 'дз', 'контрольная'])) {
    return { category: 'Учёба', keywords: keywords.join(', ') };
  }

  // Работа
  if (has(['отчёт', 'отчет', 'presentation', 'report', 'task', 'project'])) {
    return { category: 'Работа', keywords: keywords.join(', ') };
  }

  // Финансы
  if (
    ['.xls', '.xlsx', '.csv'].includes(ext) ||
    has(['счёт', 'счет', 'invoice', 'bill', 'оплата', 'платёж', 'платеж'])
  ) {
    return { category: 'Финансы', keywords: keywords.join(', ') };
  }

  // Личные документы
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
      'inn'
    ])
  ) {
    return { category: 'Личные документы', keywords: keywords.join(', ') };
  }

  // Прочее
  return { category: 'Прочее', keywords: keywords.join(', ') };
}

module.exports = {
  CATEGORIES,
  classifyDocument
};