import fs from 'fs';
import mammoth from 'mammoth';
// @ts-ignore
import pdf from 'pdf-parse';

export async function extractText(filePath: string, mime: string): Promise<string> {
  try {
    if (mime === 'application/pdf') {
      const buffer = fs.readFileSync(filePath);
      const data = await pdf(buffer);
      return data.text || '';
    }

    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const data = await mammoth.extractRawText({ path: filePath });
      return data.value || '';
    }

    if (mime.startsWith('text/')) {
      return fs.readFileSync(filePath, 'utf8');
    }

    // остальные форматы не поддерживаем
    return '';
  } catch (err) {
    console.error('Ошибка извлечения текста:', err);
    return '';
  }
}
