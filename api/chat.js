export default async function handler(req, res) {
  const VERIFY_TOKEN = "misaiverify123"; 
  const PAGE_TOKEN = process.env.PAGE_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // Webhook Verification
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send("Verification failed");
    }
  }

  // Handle Messages
  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const event = entry.messaging[0];

        if (event.message && event.message.text) {
          const userMessage = event.message.text;

          // Call OpenAI
          const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: "You are a friendly AI chatbot." },
                { role: "user", content: userMessage }
              ]
            }),
          }).then((r) => r.json());

          const reply = aiRes.choices?.[0]?.message?.content || "Error receiving response.";

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
      }

      return res.status(200).send("EVENT_RECEIVED");
    } else {
      return res.status(404).send("Not Found");
    }
  }

  return res.status(405).send("Method Not Allowed");
}
