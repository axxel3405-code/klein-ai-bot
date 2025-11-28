// pages/api/webhook.js
// FULL Final: Vercel-ready, No-Express, includes: roast, memory, images, who-made-you, GPT replies, voice (mp3)

const MAX_MEMORY = 10;
const INACTIVITY_MS = 3600000; // 1 hour

// Temporary in-memory memory structure (per user)
const userMemory = {}; // { [userId]: { user: [], bot: [], lastActive: timestamp } }

// Helper: ensure memory exists for user
function ensureMemory(userId) {
  if (!userMemory[userId]) {
    userMemory[userId] = { user: [], bot: [], lastActive: Date.now() };
  }
  // reset after inactivity
  if (Date.now() - userMemory[userId].lastActive > INACTIVITY_MS) {
    userMemory[userId] = { user: [], bot: [], lastActive: Date.now() };
  }
  userMemory[userId].lastActive = Date.now();
}

// Save bot reply into memory
function saveBotMemory(userId, message) {
  ensureMemory(userId);
  userMemory[userId].bot.push(message);
  if (userMemory[userId].bot.length > MAX_MEMORY) userMemory[userId].bot.shift();
  userMemory[userId].lastActive = Date.now();
}

// Format memory into a text block for system prompt
function buildMemoryContext(memoryObj) {
  let ctx = "";
  (memoryObj.user || []).forEach((msg, i) => {
    ctx += `User: ${msg}\n`;
    if ((memoryObj.bot || [])[i]) ctx += `Bot: ${memoryObj.bot[i]}\n`;
  });
  return ctx.trim();
}

// Send normal text message to Messenger
async function sendMessage(recipientId, text, PAGE_ACCESS_TOKEN) {
  try {
    await fetch(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text },
        }),
      }
    );
  } catch (e) {
    console.error("sendMessage error:", e);
  }
}

// Generate voice (mp3) from OpenAI TTS
async function generateVoiceMP3(text, OPENAI_API_KEY) {
  // Uses OpenAI TTS endpoint
  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      input: text,
      voice: "alloy", // default; you can expose this later
      format: "mp3",
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`TTS failed: ${resp.status} ${txt}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf); // mp3 bytes
}

// Send audio as voice message (multipart/form-data)
async function sendAudio(recipientId, audioBuffer, PAGE_ACCESS_TOKEN) {
  try {
    // Build FormData with the audio file
    const formData = new FormData();
    formData.append("recipient", JSON.stringify({ id: recipientId }));
    formData.append(
      "message",
      JSON.stringify({ attachment: { type: "audio", payload: {} } })
    );

    // Many runtimes accept Blob; Node fetch in Vercel supports Blob and FormData
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("filedata", blob, "voice.mp3");

    await fetch(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        body: formData,
      }
    );
  } catch (e) {
    console.error("sendAudio error:", e);
    throw e;
  }
}

// Roast messages
function getRandomRoast() {
  const roasts = [
    "PUTANGINA READY KA NA?? 😈🔥",
    "Oy alam mo ba? Sa sobrang hina mo, kahit calculator umiiyak pag ikaw gamit. 😭🧮",
    "Utak mo parang WiFi sa probinsya — mahina, putol-putol, minsan wala talaga. 📶💀",
    "Sa sobrang tamad mo, pati multo sa bahay niyo napagod na. 👻😮‍💨",
    "Ni nanay at tatay mo hirap ka i-defend sa barangay. 🤣🔥",
    "Ikaw lang tao na kahit hindi gumagalaw, nakakapagod panoorin. 😭💀",
    "May potential ka… potential maging warning sign. ⚠️😈",
    "Nagre-request ka ng roast? Anak, roasted ka na sa buhay pa lang. 🔥💀",
    "Kung katangahan currency, bilyonaryo ka na. 💸🧠",
    "Mas sharp pa plastic spoon kesa reasoning mo. 🥄😭",
    "Kahit ghosting, di mo alam — kasi lahat sayo nag-iignore. 👻💔",
    "Kung braincells mo empleyado, naka day-off lahat. 🧠🏖️",
  ];
  return roasts[Math.floor(Math.random() * roasts.length)];
}

// ChatGPT response with memory
async function getAIReply(userMessageRaw, memoryForUser, OPENAI_API_KEY) {
  const memoryText = buildMemoryContext(memoryForUser || { user: [], bot: [] });
  const system = `You are KleinBot, a warm, funny Filipino chatbot with short replies and emojis. Use the memory naturally when replying.`;

  const messages = [
    { role: "system", content: system + (memoryText ? `\n\nMemory:\n${memoryText}` : "") },
    { role: "user", content: userMessageRaw },
  ];

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 400,
    }),
  });

  if (!r.ok) {
    const txt = await r.text();
    console.error("OpenAI chat error:", r.status, txt);
    return "Sorry, nagka-error ako 😭";
  }

  const data = await r.json();
  return data?.choices?.[0]?.message?.content ?? "Sorry, nagka-error ako 😭";
}

// Voice trigger regex (robust)
const voiceRegex = /^(?:ai[\s\.\-]*say|a\.i[\s\.\-]*say|aisay|ai-say)\s+(.+)$/i;

// Main handler
export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!PAGE_ACCESS_TOKEN || !OPENAI_API_KEY) {
    console.error("Missing env vars: PAGE_ACCESS_TOKEN or OPENAI_API_KEY");
    // But still respond 200 for FB webhook health
  }

  // Webhook verification
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

  // Handle incoming messages
  if (req.method === "POST") {
    try {
      const body = req.body;

      if (body.object !== "page") {
        return res.status(200).send("Ignored");
      }

      for (const entry of body.entry || []) {
        const messaging = entry.messaging || [];
        for (const event of messaging) {
          try {
            // Only handle message events with text
            if (!event.message || !event.message.text) continue;

            const userId = event.sender.id;
            let userTextRaw = event.message.text || "";
            const userTextLower = userTextRaw.toLowerCase().trim();

            // Ensure memory exists
            ensureMemory(userId);

            // Save user message raw (store original casing)
            userMemory[userId].user.push(userTextRaw);
            if (userMemory[userId].user.length > MAX_MEMORY) userMemory[userId].user.shift();

            // ---------- Voice trigger (robust) ----------
            const voiceMatch = userTextRaw.match(voiceRegex);
            if (voiceMatch) {
              const spokenText = voiceMatch[1].trim();
              if (!spokenText) {
                const reply = "Ano gusto mong sabihin ko? 😄🎤";
                await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
                saveBotMemory(userId, reply);
                continue;
              }

              // Generate audio from OpenAI
              let audioBuffer = null;
              try {
                audioBuffer = await generateVoiceMP3(spokenText, OPENAI_API_KEY);
              } catch (ttsErr) {
                console.error("TTS error:", ttsErr);
                // fallback: send text reply repeating the phrase
                const fallback = `Sori, hindi makagawa ng audio ngayon. Narito ang sinabi ko: "${spokenText}"`;
                await sendMessage(userId, fallback, PAGE_ACCESS_TOKEN);
                saveBotMemory(userId, fallback);
                continue;
              }

              // Send audio to Messenger
              try {
                await sendAudio(userId, audioBuffer, PAGE_ACCESS_TOKEN);
                const reply = `🎧 Sige! Sinabi ko na: "${spokenText}"`;
                saveBotMemory(userId, reply);
              } catch (sendAudioErr) {
                console.error("sendAudio failed:", sendAudioErr);
                // fallback: send text reply
                const fallback = `Audio failed to send. Sabihin ko na lang: "${spokenText}"`;
                await sendMessage(userId, fallback, PAGE_ACCESS_TOKEN);
                saveBotMemory(userId, fallback);
              }

              continue; // handled
            }

            // ---------- Who made you ----------
            const creatorTriggers = [
              "who made you", "who make you", "who created you",
              "sino gumawa sayo", "sino gumawa sa'yo", "gumawa sayo", "sino gumawa sayo?"
            ];
            if (creatorTriggers.some(q => userTextLower.includes(q))) {
              const reply = "I was proudly made by a Grade 12 TVL-ICT student named Klein Dindin 🤖🔥";
              await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
              saveBotMemory(userId, reply);
              continue;
            }

            // ---------- Image search ----------
            if (userTextLower.includes("picture") || userTextLower.includes("image") || userTextLower.includes("pictures") || userTextLower.includes("images")) {
              const q = encodeURIComponent(userTextRaw);
              const link = `https://www.google.com/search?q=${q}&tbm=isch`;
              const reply = `Here you go! 🔍✨\nI found something for you:\n${link}`;
              await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
              saveBotMemory(userId, reply);
              continue;
            }

            // ---------- Roast Mode ----------
            if (userTextLower.includes("roast me")) {
              const roast = getRandomRoast();
              await sendMessage(userId, roast, PAGE_ACCESS_TOKEN);
              saveBotMemory(userId, roast);
              continue;
            }

            // ---------- Normal AI reply (with memory) ----------
            const memoryContext = userMemory[userId];
            let aiReply = "Sorry, nagka-error ako 😭";
            try {
              aiReply = await getAIReply(userTextRaw, memoryContext, OPENAI_API_KEY);
            } catch (aiErr) {
              console.error("AI reply error:", aiErr);
            }

            // Send reply and save to memory
            await sendMessage(userId, aiReply, PAGE_ACCESS_TOKEN);
            saveBotMemory(userId, aiReply);
          } catch (innerErr) {
            console.error("Inner message handler error:", innerErr);
          }
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    } catch (err) {
      console.error("Webhook POST error:", err);
      return res.status(500).send("Server Error");
    }
  }

  return res.status(405).send("Method Not Allowed");
      }
