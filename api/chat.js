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
    }
    return res.status(403).send("Verification failed");
  }

  // Handle Messages (POST)
  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const event = entry.messaging[0];

        if (event.message && event.message.text) {
          const userMessage = event.message.text.toLowerCase();

          // --- FIXED FEATURE 1: "Who made you?" answers ---
          const creatorQuestions = [
            "who made you",
            "who make you",
            "who created you",
            "sino gumawa sayo",
            "sino gumawa sa'yo",
            "gumawa sayo",
            "gumawa sa'yo"
          ];

          if (creatorQuestions.some(q => userMessage.includes(q))) {
            await sendReply(event.sender.id,
              "I was made by a Grade 12 TVL-ICT student named **Klein Dindin** 😄."
            );
            continue;
          }

          // --- FIXED FEATURE 2: Magic word search ---
          // Pattern: "<anything> pictures" or "<anything> pics"
          const searchMatch = userMessage.match(/(.+?)\s+(pictures|pics|images)/);

          if (searchMatch) {
            const query = encodeURIComponent(searchMatch[1]);
            const safeSearchUrl =
              `https://www.google.com/search?q=${query}&tbm=isch&safe=active`;

            await sendReply(event.sender.id,
              `Here you go! 😊\nSafe image results for **${searchMatch[1]}**:\n${safeSearchUrl}`
            );
            continue;
          }

          // --- DEFAULT: Send to OpenAI (clean, friendly) ---
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
                  content: "You are KleinBot — friendly, short, safe, helpful, with light emojis. Keep responses clean and compliant with Meta rules."
                },
                { role: "user", content: userMessage }
              ]
            }),
          });

          const aiData = await aiResponse.json();
          const reply = aiData?.choices?.[0]?.message?.content || "Oops! Something went wrong 😅";

          await sendReply(event.sender.id, reply);
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.status(404).send("Not Found");
  }

  return res.status(405).send("Method Not Allowed");

  // --- Helper Function ---
  async function sendReply(senderId, message) {
    await fetch(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: senderId },
          message: { text: message },
        }),
      }
    );
  }
}
