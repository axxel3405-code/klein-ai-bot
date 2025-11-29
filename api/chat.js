// pages/api/chat.js
// KleinBot webhook - cleaned, ElevenLabs-only TTS, memory, footer, simple Ai-say

const MAX_MEMORY = 10;
const INACTIVITY_MS = 3600000; // 1 hour
const userMemory = {};

function ensureUserMemory(userId) {
  if (!userMemory[userId]) {
    userMemory[userId] = { user: [], bot: [], lastActive: Date.now(), messageCount: 0 };
  }
  if (Date.now() - userMemory[userId].lastActive > INACTIVITY_MS) {
    userMemory[userId] = { user: [], bot: [], lastActive: Date.now(), messageCount: 0 };
  }
  userMemory[userId].lastActive = Date.now();
}

function saveUserMessage(userId, text) {
  ensureUserMemory(userId);
  userMemory[userId].user.push({ text, ts: Date.now() });
  if (userMemory[userId].user.length > MAX_MEMORY) userMemory[userId].user.shift();
  userMemory[userId].lastActive = Date.now();
}

function saveBotMessage(userId, text) {
  ensureUserMemory(userId);
  userMemory[userId].bot.push({ text, ts: Date.now() });
  if (userMemory[userId].bot.length > MAX_MEMORY) userMemory[userId].bot.shift();
  userMemory[userId].lastActive = Date.now();
}

function buildMemoryContext(userId) {
  ensureUserMemory(userId);
  const u = userMemory[userId].user;
  const b = userMemory[userId].bot;
  const lines = [];
  const max = Math.max(u.length, b.length);
  for (let i = 0; i < max; i++) {
    if (u[i]) lines.push(`User: ${u[i].text}`);
    if (b[i]) lines.push(`Bot: ${b[i].text}`);
  }
  return lines.join("\n");
}

async function safeFetch(url, options) {
  return fetch(url, options);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const FOOTER = "\n\n\nUse <GptHelp> command to see all of the current commands.";
function buildFooterText(text) {
  if (!text) return FOOTER.trim();
  if (text.includes(FOOTER)) return text;
  return `${text}${FOOTER}`;
}

async function sendMessage(recipientId, text, PAGE_ACCESS_TOKEN) {
  await safeFetch(
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
}

async function sendTextReply(recipientId, text, PAGE_ACCESS_TOKEN, appendFooter = false) {
  const final = appendFooter ? buildFooterText(text) : text;
  await sendMessage(recipientId, final, PAGE_ACCESS_TOKEN);
  return final;
}

// === TRIGGERS & VARIANTS ===

// Simple Ai-say voice trigger (only the simple variants you selected)
const voiceRegex = /^(?:ai[\s.\-]*say|a\.i[\s.\-]*say|aisay|ai-say)\s+(.+)$/i;

const helpVariants = [
  "gpthelp", "gpt help", "gpt-help",
  "kleinhelp", "klein help", "klein-help",
  "help kleinbot", "help klein", "kbhelp"
];

const creatorFullVariants = [
  "klein dindin", "kleindindin", "rjklein", "rjdindin",
  "rj klein", "rj dindin", "dindin klein", "klein dindin"
];

const botNameVariants = ["kleinbot", "klein bot", "klein_bot", "kleinbot!", "klein-bot"];
const singleKlein = ["klein"];

const FIXED_CREATOR_REPLY = "Oh! You're talking about my creator, well he's busy rn, nag lulu pasya 🙏\nBut I'm here you can talk to me. ❤️🤩";

const ROASTS = [
  "Landi gusto ligo ayaw? 🤢🤮",
  "Oy bes! Diba ikaw yung nag ra rants kay chatgpt? Kase wlay may interest sa mga kwento mo. 🔥💀",
  "Oy alam mo ba? Sa sobrang hina mo, kahit calculator umiiyak pag ikaw gamit. 😭🧮",
  "Utak mo parang WiFi sa probinsya — mahina, putol-putol, minsan wala talaga. 📶💀",
  "Sa sobrang tamad mo, pati multo sa bahay niyo napagod na. 👻😮‍💨",
  "Ni nanay at tatay mo hirap ka i-defend sa barangay. 🤣🔥",
  "Ikaw lang tao na kahit hindi gumagalaw, nakakapagod panoorin. 😭💀",
  "May potential ka… potential maging warning sign. ⚠️😈",
  "Nagre-request ka ng roast? Anak, roasted ka na sa buhay pa lang. 🔥💀",
  "Kung katangahan currency, bilyonaryo ka na. 💸🧠"
];

function pickRoast() {
  return ROASTS[Math.floor(Math.random() * ROASTS.length)];
}

// === ELEVENLABS TTS (Rachel voice) - PRIMARY (uses attachment upload method)
const ELEVEN_VOICE_ID = "6AUOG2nbfr0yFEeI0784";
async function generateElevenLabsVoice(text) {
  try {
    const resp = await safeFetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v1" }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "no-body");
      console.error("ElevenLabs TTS error:", resp.status, t);
      return null;
    }
    const array = await resp.arrayBuffer();
    return Buffer.from(array);
  } catch (e) {
    console.error("ElevenLabs exception:", e);
    return null;
  }
}

// upload attachment to Messenger (returns attachment_id)
async function uploadAttachment(audioBuffer, PAGE_ACCESS_TOKEN) {
  const FormDataNode = require("form-data");
  const form = new FormDataNode();
  form.append("message", JSON.stringify({ attachment: { type: "audio", payload: {} } }));
  form.append("filedata", audioBuffer, { filename: "voice.mp3", contentType: "audio/mpeg" });
  const resp = await safeFetch(
    `https://graph.facebook.com/v17.0/me/message_attachments?access_token=${PAGE_ACCESS_TOKEN}`,
    { method: "POST", body: form, headers: form.getHeaders ? form.getHeaders() : {} }
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "no-body");
    throw new Error("Attachment upload failed: " + resp.status + " " + txt);
  }
  const json = await resp.json();
  return json?.attachment_id || null;
}

async function getAIReply(openaiApiKey, userMessage, memoryContext) {
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are KleinBot, a warm, funny American half Filipino chatbot with short replies and emojis. Use the memory naturally when replying." },
      { role: "system", content: memoryContext ? `Memory:\n${memoryContext}` : "" },
      { role: "user", content: userMessage },
    ],
    max_tokens: 400,
  };
  const resp = await safeFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "no-body");
    console.error("OpenAI chat error:", resp.status, txt);
    return "Sorry, nagka-error ako 😭";
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "Sorry, nagka-error ako 😭";
}

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).send("Verification failed");
  }

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const body = req.body;
    if (body.object !== "page") return res.status(200).send("Ignored");

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        try {
          if (!event.message || !event.sender?.id) continue;
          if (!event.message.text) continue;

          const userId = event.sender.id;
          const rawText = event.message.text;
          const text = rawText.trim();
          const textLower = text.toLowerCase();

          ensureUserMemory(userId);
          saveUserMessage(userId, text);
          userMemory[userId].messageCount = (userMemory[userId].messageCount || 0) + 1;
          const currentMsgCount = userMemory[userId].messageCount;

          const shouldAppendFooterByCount =
            currentMsgCount === 1 || (currentMsgCount % 10 === 0);

          const normalizedHelp = textLower.replace(/\s+/g, "");
          const isHelp = helpVariants.some(v => normalizedHelp.includes(v.replace(/\s+/g, "")));

          if (isHelp) {
            const helpReply = `✳️This are the current commands you can try: 

📜Ai say 
E.g "Ai say banana"

📜Roast me
(Current roasts are mostly tagalog)

📜Ai picture of ___
E.g "Ai pictures of anime please"

📜Ai motivate me

--- KleinBot is still improving, not much features right now because we're using Free-Plan OPEN-AI API Model. Have a wonderful day and enjoy chatting with KleinBot, your personal tambay kachikahan.❤️ ---
-KleinDindin`;
            const finalHelp = helpReply;
            await sendTextReply(userId, finalHelp, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, finalHelp);
            continue;
          }

          const normalizedNoSpace = textLower.replace(/\s+/g, "");
          const isCreator = creatorFullVariants.some(v => normalizedNoSpace.includes(v.replace(/\s+/g, "")));
          if (isCreator) {
            const sendCreator = shouldAppendFooterByCount
              ? await sendTextReply(userId, FIXED_CREATOR_REPLY, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, FIXED_CREATOR_REPLY, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendCreator);
            continue;
          }

          const isBotName = botNameVariants.some(v => normalizedNoSpace.includes(v.replace(/\s+/g, "")));
          if (isBotName) {
            const botReply = "Yes? I'm here! 🤖💛";
            const sendBotName = shouldAppendFooterByCount
              ? await sendTextReply(userId, botReply, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, botReply, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendBotName);
            continue;
          }

          if (singleKlein.includes(textLower)) {
            const clarify = "Uhm, are you talking about me, KleinBot, or my creator? Let me know 🤩";
            const sendClarify = shouldAppendFooterByCount
              ? await sendTextReply(userId, clarify, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, clarify, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendClarify);
            continue;
          }

          const voiceMatch = text.match(voiceRegex);
          if (voiceMatch) {
            const spokenText = voiceMatch[1].trim();
            if (!spokenText) {
              const reply = "What do you want me to say in voice? 😄🎤";
              const sendFallback = shouldAppendFooterByCount
                ? await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, true)
                : await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, false);
              saveBotMessage(userId, sendFallback);
              continue;
            }
            try {
              // ElevenLabs primary
              const elevenBuffer = await generateElevenLabsVoice(spokenText);
              if (elevenBuffer) {
                await wait(500);
                const attachmentId = await uploadAttachment(elevenBuffer, PAGE_ACCESS_TOKEN);
                if (!attachmentId) throw new Error("No attachment_id from upload");
                await safeFetch(
                  `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      recipient: { id: userId },
                      messaging_type: "RESPONSE",
                      message: {
                        attachment: { type: "audio", payload: { attachment_id: attachmentId } },
                      },
                    }),
                  }
                );
                saveBotMessage(userId, `🎤 Sent audio (ElevenLabs): "${spokenText}"`);
              } else {
                // ElevenLabs failed -> English text fallback (you requested)
                const fallback = `Sorry, I can't generate audio right now 😭 try again later!`;
                const sendFallback = shouldAppendFooterByCount
                  ? await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, true)
                  : await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, false);
                saveBotMessage(userId, sendFallback);
              }
            } catch (err) {
              console.error("TTS/sendAudio error:", err);
              const fallback = `Sorry, I can't generate audio right now 😭 try again later!`;
              const sendFallback = shouldAppendFooterByCount
                ? await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, true)
                : await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, false);
              saveBotMessage(userId, sendFallback);
            }
            continue;
          }

          if (
            textLower.includes("picture") ||
            textLower.includes("image") ||
            textLower.includes("photo") ||
            textLower.includes("pic")
          ) {
            const q = encodeURIComponent(text);
            const link = `https://www.google.com/search?q=${q}&tbm=isch`;
            const reply = `📸 Here you go!\n${link}`;
            const sendImg = shouldAppendFooterByCount
              ? await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendImg);
            continue;
          }

          if (textLower.includes("roast me")) {
            const roast = pickRoast();
            const sendRoast = shouldAppendFooterByCount
              ? await sendTextReply(userId, roast, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, roast, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendRoast);
            continue;
          }

          const whoMadeTriggers = [
            "who made you", "who created you", "who make you",
            "sino gumawa sayo", "gumawa sayo"
          ];
          if (whoMadeTriggers.some(t => textLower.includes(t))) {
            const reply = "I was proudly made by a Grade 12 TVL-ICT student named Klein Dindin 🤖🔥";
            const sendWho = shouldAppendFooterByCount
              ? await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendWho);
            continue;
          }

          const memoryContext = buildMemoryContext(userId);
          const aiReply = await getAIReply(OPENAI_API_KEY, text, memoryContext);

          const isAiHelpExact = aiReply && aiReply.trim() === `✳️This are the current commands you can try: 

📜Ai say 
E.g "Ai say banana"

📜Roast me
(Current roasts are mostly tagalog)

📜Ai picture of ___
E.g "Ai pictures of anime please"

📜Ai motivate me

--- KleinBot is still improving, not much features right now because we're using Free-Plan OPEN-AI API Model. Have a wonderful day and enjoy chatting with KleinBot, your personal tambay kachikahan.❤️ ---
-KleinDindin`;

          const appendFooterNow = shouldAppendFooterByCount && !isAiHelpExact;

          const finalAi = appendFooterNow
            ? await sendTextReply(userId, aiReply, PAGE_ACCESS_TOKEN, true)
            : await sendTextReply(userId, aiReply, PAGE_ACCESS_TOKEN, false);

          saveBotMessage(userId, finalAi);
        } catch (evtErr) {
          console.error("Event handler error:", evtErr);
        }
      }
    }

    return res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("Webhook POST error:", err);
    return res.status(500).send("Server Error");
  }
}
