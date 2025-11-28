export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // Webhook Verification (GET)
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

  // Handle Messages (POST)
  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const event = entry.messaging[0];

        if (event.message && event.message.text) {
          const userMessage = event.message.text.toLowerCase();

          // --- Custom Rule: "Who made you?" ---
          if (
            userMessage.includes("who made you") ||
            userMessage.includes("who make you") ||
            userMessage.includes("who created you") ||
            userMessage.includes("sino gumawa sayo") ||
            userMessage.includes("sino gumawa sa'yo") ||
            userMessage.includes("gumawa sayo")
          ) {
            const fixedReply = "I was made by a Grade 12 TVL-ICT student named Klein Dindin 😄.";

            await fetch(
              `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipient: { id: event.sender.id },
                  message: { text: fixedReply },
                }),
              }
            );

            return res.status(200).send("EVENT_RECEIVED");
          }

          // --- OpenAI Response ---
          const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "You are a friendly chatbot. Always respond SHORT, CLEAN, and EASY to read. Use emojis when helpful. Be positive, safe, respectful, and avoid harmful content. Do not send long paragraphs."
                },
                { role: "user", content: userMessage }
              ]
            }),
          });

          const aiData = await aiResponse.json();
          const reply = aiData?.choices?.[0]?.message?.content || "Oops, something went wrong 😅";

          // --- Send AI reply to Messenger ---
          await fetch(
            `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
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
    }

    return res.status(404).send("Not Found");
  }

  return res.status(405).send("Method Not Allowed");
            }
