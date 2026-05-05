import { Router } from 'express';
import * as auth from '../auth';
import * as db from '../db';
import { askAssistant } from '../assistant';
import { toggleReaction } from '../db';


const router = Router();

router.post('/assistant', auth.authRequired, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const { question, docIds } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Вопрос не указан' });
    }

    let docsText = '';
    let usedDocs: string[] = [];

    // 🔥 Если указаны конкретные документы
    if (Array.isArray(docIds) && docIds.length > 0) {
      for (const id of docIds) {
        const doc = db.getDocument(Number(id), userId);
        if (doc?.content) {
          const snippet = doc.content.substring(0, 500);
          docsText += `Документ "${doc.original_name}":\n${snippet}...\n\n`;
          usedDocs.push(doc.original_name);
        }
      }
    } else {
      // 🔥 Автоматический поиск по документам
      const docs = db.listDocuments({ userId, query: question }).slice(0, 3);
      for (const doc of docs) {
        if (doc.content) {
          const idx = doc.content.toLowerCase().indexOf(question.toLowerCase());
          let snippet = doc.content;
          if (idx >= 0) {
            const start = Math.max(0, idx - 200);
            const end = Math.min(doc.content.length, idx + 500);
            snippet = doc.content.substring(start, end);
          } else {
            snippet = doc.content.substring(0, 500);
          }
          docsText += `Документ "${doc.original_name}":\n${snippet}...\n\n`;
          usedDocs.push(doc.original_name);
        }
      }
    }

    // 🔥 Берём последние 5 сообщений из истории
    const history = db.listAssistantHistory(userId).slice(-5);
    let historyText = '';
    for (const h of history) {
      historyText += `Пользователь: ${h.question}\nАссистент: ${h.answer}\n\n`;
    }

    // 🔥 Формируем полный prompt
    let fullPrompt = '';
    if (docsText) {
      fullPrompt = `История диалога:\n${historyText}\nВопрос пользователя: ${question}\n\nКонтекст из документов:\n${docsText}`;
    } else {
      fullPrompt = `История диалога:\n${historyText}\nВопрос пользователя: ${question}`;
    }

    const result = await askAssistant(userId, fullPrompt);

    // сохраняем запись и возвращаем её целиком
    const entry = db.addAssistantEntry(userId, question, result.answer, usedDocs);

    res.json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка ассистента' });
  }
});

router.get('/assistant/history', auth.authRequired, (req, res) => {
  try {
    const userId = (req as any).userId;
    const history = db.listAssistantHistory(userId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка получения истории' });
  }
});

router.post('/assistant/reaction', auth.authRequired, (req, res) => {
  try {
    const userId = (req as any).userId;
    const { entryId, reaction } = req.body;

    if (!entryId || !reaction) {
      return res.status(400).json({ error: 'entryId и reaction обязательны' });
    }

    const entry = db.listAssistantHistory(userId).find(e => e.id === entryId);
    if (!entry) {
      return res.status(403).json({ error: 'Нет доступа' });
    }

    const updated = toggleReaction(entryId, reaction);

    res.json({ ok: true, reactions: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сохранения реакции' });
  }
});

export default router;
