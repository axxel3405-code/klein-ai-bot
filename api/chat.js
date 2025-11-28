import fetch from "node-fetch";

export default async function handler(req, res) {
  const VERIFY_TOKEN = "misaiverify123"; // choose anything
  const PAGE_TOKEN = process.env.PAGE_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // FB verification
  if (req.method === "GET") {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
      return res.send(req.query["hub.challenge"]);
    }
    return res.send("Verification failed");
  }

  // Receiving messages
  const data = req.body;
  if (data.object === "page") {
    data.entry.forEach(async (entry) => {
      const event = entry.messaging[0];
      if (event.message && event.message.text) {
        const userMessage = event.message.text;

        // Send message to OpenAI API
        const aiResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: "You are a friendly AI chatbot." },
                { role: "user", content: userMessage },
              ],
            }),
          }
        ).then((r) => r.json());

        const reply =
          aiResponse.choices?.[0]?.message?.content || "Error answering.";

        // Send reply to Messenger
        await fetch(
          `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_TOKEN}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: { id: event.sender.id },
              message: { text: reply },
            }),
          }
        );
      }
    });
  }

  res.send("ok");
}
