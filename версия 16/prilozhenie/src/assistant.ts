import fetch from "node-fetch";

export async function askAssistant(userId: number, question: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { answer: "Ошибка: GROQ_API_KEY не задан" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",   // актуальная модель Groq
      messages: [
        { role: "system", content: "Ты — полезный ассистент." },
        { role: "user", content: question }
      ]
    })
  });

  const data: any = await response.json();
  console.log("GROQ RAW RESPONSE:", data);

  const answer =
    data?.choices?.[0]?.message?.content ||
    "Ассистент не смог сформировать ответ";

  return { answer };
}
