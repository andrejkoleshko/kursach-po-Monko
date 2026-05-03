import { Router } from 'express';
import * as auth from '../auth';
import * as db from '../db';
import { askAssistant } from '../assistant';

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

    if (Array.isArray(docIds) && docIds.length > 0) {
      for (const id of docIds) {
        const doc = db.getDocument(Number(id), userId);
        if (doc?.content) {
          docsText += `Документ "${doc.original_name}":\n${doc.content}\n\n`;
          usedDocs.push(doc.original_name);
        }
      }
    } else {
      const docs = db.listDocuments({ userId, query: question });
      for (const doc of docs) {
        if (doc.content) {
          docsText += `Документ "${doc.original_name}":\n${doc.content}\n\n`;
          usedDocs.push(doc.original_name);
        }
      }
    }

    const fullPrompt = docsText
      ? `Вопрос пользователя: ${question}\n\nКонтекст из документов:\n${docsText}`
      : question;

    const result = await askAssistant(userId, fullPrompt);

    // 🔥 сохраняем запись и возвращаем её целиком
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

export default router;