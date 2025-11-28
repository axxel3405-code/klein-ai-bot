// /api/app.js
export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // Simple in-memory session store (short-term memory).
  // Note: serverless instances may be recycled, so this is short-term only.
  const sessionStore = global.__KLEINBOT_SESSIONS ||= {};

  // Helpers
  function now() {
    return Date.now();
  }

  function cleanupSessions() {
    const TTL = 1000 * 60 * 30; // 30 minutes
    for (const id of Object.keys(sessionStore)) {
      if (now() - sessionStore[id].lastActive > TTL) {
        delete sessionStore[id];
      }
    }
  }

  function ensureSession(id) {
    cleanupSessions();
    if (!sessionStore[id]) {
      sessionStore[id] = { messages: [], lastActive: now(), palambingUntil: 0 };
    }
    sessionStore[id].lastActive = now();
    return sessionStore[id];
  }

  async function sendReply(senderId, message) {
    try {
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
    } catch (err) {
      console.error("sendReply error:", err?.message || err);
    }
  }

  // Forbidden words (basic)
  const forbiddenWords = [
    "porn", "sex", "nude", "hentai", "xxx", "nsfw", "adult", "69",
    "pussy", "cock", "blowjob", "anal"
  ];
  function hasForbidden(text) {
    return forbiddenWords.some(w => text.toLowerCase().includes(w));
  }

  // Creator triggers (all variants)
  const creatorTriggers = [
    "who made you",
    "who make you",
    "who created you",
    "sino gumawa sayo",
    "sino gumawa sa'yo",
    "gumawa sayo",
    "gumawa sa'yo"
  ];

  // Palambing / comfort triggers (Tagalog + English)
  const palambingTriggers = [
    "palambing", "palambingin", "comfort me", "comfort", "sad ako",
    "i'm sad", "can you comfort", "need lambing", "need comfort",
    "pwede palambing", "lamigin", "lambing", "sad ako naman"
  ];

  // Picture triggers (words that indicate user wants images)
  const pictureTriggers = ["picture", "pictures", "pic", "pics", "image", "images", "wallpaper", "wallpapers"];

  // Build Google image search link (safe)
  function googleImageLink(query) {
    const encoded = encodeURIComponent(query);
    return `https://www.google.com/search?q=${encoded}&tbm=isch&safe=active`;
  }

  // Build OpenAI messages from session memory
  function buildMessagesForOpenAI(session, isPalambingActive) {
    // Base system prompt (default)
    const baseSystem = `You are KleinBot: helpful, short, and friendly. Keep replies short (1-3 sentences), positive, and safe for Meta. Use emojis lightly.`;

    // Palambing system prompt (used when user asks for affection/comfort)
    const palambingSystem = `You are KleinBot in a sweet & gentle "palambing" mode (soft, warm, caring). Respond with comforting, kind, and gentle language. Keep it short, sincere, and safe. Use gentle emojis like 🤍✨🤗. Avoid flirtatious or sexual content.`;

    // Humor instruction blended in (60% sweet / 40% playful)
    const humorAddOn = `Tone: 60% sweet, 40% playful — a little teasing when appropriate but respectful. Keep messages short.`;

    const messages = [
      {
        role: "system",
        content: isPalambingActive ? `${baseSystem}\n${palambingSystem}\n${humorAddOn}` : `${baseSystem}\n${humorAddOn}`
      }
    ];

    // Append recent conversation from session (max last 8 entries)
    const max = 8;
    const recent = session.messages.slice(-max);
    for (const m of recent) {
      messages.push({ role: m.role, content: m.content });
    }

    return messages;
  }

  // Webhook verification (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Verification failed");
  }

  // Handle messages (POST)
  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const event = entry.messaging?.[0];
        if (!event) continue;

        const senderId = event.sender?.id;
        if (!senderId) continue;

        if (event.message && event.message.text) {
          const rawText = String(event.message.text).trim();
          const text = rawText.toLowerCase();

          // Setup session
          const session = ensureSession(senderId);

          // 1) Creator triggers (preset, skip OpenAI)
          if (creatorTriggers.some(t => text.includes(t))) {
            await sendReply(senderId, "I was made by a Grade 12 TVL-ICT student named Klein Dindin 😄.");
            // Save assistant reply to memory
            session.messages.push({ role: "user", content: rawText });
            session.messages.push({ role: "assistant", content: "I was made by a Grade 12 TVL-ICT student named Klein Dindin 😄." });
            continue;
          }

          // 2) Magic image search (pattern and triggers)
          // Match patterns like "anime pictures", "cute cat images please", "sunset wallpaper"
          const pictureRegex = /(.+?)\s+(pictures|picture|pics|pic|images|image|wallpaper|wallpapers)(\s*please)?$/i;
          const picMatch = rawText.match(pictureRegex);
          if (picMatch) {
            const topic = picMatch[1].trim();
            if (hasForbidden(topic)) {
              await sendReply(senderId, "Sorry 😅 I can't search for that. Try something safer!");
              // log to session
              session.messages.push({ role: "user", content: rawText });
              session.messages.push({ role: "assistant", content: "Sorry 😅 I can't search for that. Try something safer!" });
              continue;
            }
            const link = googleImageLink(topic);
            const reply = `Here you go! 🔍😊\nSafe image results for "${topic}":\n👉 ${link}`;
            await sendReply(senderId, reply);
            // save
            session.messages.push({ role: "user", content: rawText });
            session.messages.push({ role: "assistant", content: reply });
            continue;
          }

          // 3) Palambing detection: if user asked for affection / comfort, set palambing mode
          const askedForPalambing = palambingTriggers.some(p => text.includes(p));
          if (askedForPalambing) {
            // set palambing mode active for next few minutes (so bot can continue gentle for a short time)
            session.palambingUntil = now() + 1000 * 60 * 5; // 5 minutes of palambing mode
            // For immediate reply we'll call OpenAI with palambing mode on
          }

          // 4) If the message contains an obvious forbidden term, refuse
          if (hasForbidden(text)) {
            const refuse = "Sorry 😅 I can't help with that. Please ask for something else!";
            await sendReply(senderId, refuse);
            session.messages.push({ role: "user", content: rawText });
            session.messages.push({ role: "assistant", content: refuse });
            continue;
          }

          // 5) Prepare messages for OpenAI using session memory
          // push current user message into session memory first
          session.messages.push({ role: "user", content: rawText });

          // Trim session messages to reasonable size (avoid big payloads)
          const MAX_SESSION = 20;
          if (session.messages.length > MAX_SESSION) {
            session.messages = session.messages.slice(-MAX_SESSION);
          }

          const isPalambingActive = now() < (session.palambingUntil || 0);

          const messagesForOpenAI = buildMessagesForOpenAI(session, isPalambingActive);

          // 6) Call OpenAI
          let aiReply = "Oops! Something went wrong 😅";
          try {
            const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${OPENAI_API_KEY}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: messagesForOpenAI,
                max_tokens: 200,
                temperature: 0.7
              }),
            });
            const aiData = await aiResp.json();
            aiReply = aiData?.choices?.[0]?.message?.content?.trim() || aiReply;

            // Post-process: shorten if too long, ensure short & clean
            if (aiReply.length > 800) {
              aiReply = aiReply.split("\n").slice(0, 5).join("\n").slice(0, 700) + "…";
            }
          } catch (err) {
            console.error("OpenAI error:", err?.message || err);
            aiReply = "Sorry 😅 I couldn't think of a good answer right now.";
          }

          // 7) Save assistant reply to memory & send
          session.messages.push({ role: "assistant", content: aiReply });
          // keep memory bounded
          if (session.messages.length > MAX_SESSION) {
            session.messages = session.messages.slice(-MAX_SESSION);
          }

          await sendReply(senderId, aiReply);
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.status(404).send("Not Found");
  }

  return res.status(405).send("Method Not Allowed");
              }
