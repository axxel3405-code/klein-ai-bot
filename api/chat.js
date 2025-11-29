// KleinBot final webhook (FULL VERSION)
// Includes: ElevenLabs (Adam, free tier), Footer logic, Roast, Memory, Image search, Ai say, etc.

const MAX_MEMORY = 10;
const INACTIVITY_MS = 3600000;
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
}

function saveBotMessage(userId, text) {
  ensureUserMemory(userId);
  userMemory[userId].bot.push({ text, ts: Date.now() });
  if (userMemory[userId].bot.length > MAX_MEMORY) userMemory[userId].bot.shift();
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

// SIMPLE AI-SAY
const voiceRegex = /^(?:ai[\s.\-]*say|aisay|a\.i[\s.\-]*say|ai-say)\s+(.+)$/i;

// HELP COMMAND
const helpVariants = [
  "gpthelp", "gpt help", "kleinhelp", "klein help",
  "help kleinbot", "help klein", "kbhelp"
];

// CREATOR DETECTOR
const creatorFullVariants = [
  "kleindindin", "klein dindin", "rj klein", "rjdindin",
  "rjklein", "rj dindin", "dindin klein"
];

// BOT NAME DETECTOR
const botNameVariants = ["kleinbot", "klein bot", "klein-bot", "klein_bot"];
const singleKlein = ["klein"];

const FIXED_CREATOR_REPLY =
  "Oh! You're talking about my creator, well he's busy rn, nag lulu pasya 🙏\nBut I'm here you can talk to me. ❤️🤩";

// ROAST LIST
const ROASTS = [
  "Landi gusto ligo ayaw? 🤢🤮",
  "Oy bes! Diba ikaw yung nag ra rants kay chatgpt? Kase wlay may interest sa mga kwento mo. 🔥💀",
  "Utak mo parang WiFi sa probinsya — mahina, putol-putol, minsan wala talaga. 📶💀",
  "Ni nanay at tatay mo hirap ka i-defend sa barangay. 🤣🔥",
  "Kung katangahan currency, bilyonaryo ka na. 💸🧠"
];

function pickRoast() {
  return ROASTS[Math.floor(Math.random() * ROASTS.length)];
}

//
// 🚀 FINAL ELEVENLABS – ADAM VOICE – FREE MODEL
//
const ELEVEN_VOICE_ID = "Adam";

async function generateElevenLabsVoice(text) {
  try {
    const resp = await safeFetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + ELEVEN_VOICE_ID,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": process.env.ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.5, similarity_boost: 0.5 }
        })
      }
    );

    if (!resp.ok) return null;

    const array = await resp.arrayBuffer();
    return Buffer.from(array);

  } catch (e) {
    return null;
  }
}

async function uploadAttachment(audioBuffer, PAGE_ACCESS_TOKEN) {
  const FormDataNode = require("form-data");
  const form = new FormDataNode();

  form.append("message", JSON.stringify({
    attachment: { type: "audio", payload: {} }
  }));
  form.append("filedata", audioBuffer, {
    filename: "voice.mp3",
    contentType: "audio/mpeg"
  });

  const resp = await safeFetch(
    `https://graph.facebook.com/v17.0/me/message_attachments?access_token=${PAGE_ACCESS_TOKEN}`,
    { method: "POST", body: form, headers: form.getHeaders() }
  );

  const json = await resp.json();
  return json?.attachment_id || null;
}

// GPT REPLY
async function getAIReply(openaiKey, userMessage, memory) {
  const resp = await safeFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are KleinBot, a friendly American-Filipino chatbot with short replies and emojis." },
        { role: "system", content: memory ? `Memory:\n${memory}` : "" },
        { role: "user", content: userMessage }
      ],
      max_tokens: 200
    })
  });

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || "Sorry, nagka-error ako 😭";
}

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI = process.env.OPENAI_API_KEY;

  if (req.method === "GET") {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN)
      return res.send(req.query["hub.challenge"]);
    return res.status(403).send("Verification failed");
  }

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const body = req.body;
    if (body.object !== "page") return res.send("Ignored");

    for (const entry of body.entry) {
      for (const event of entry.messaging) {
        if (!event.message?.text) continue;

        const userId = event.sender.id;
        const text = event.message.text.trim();
        const lower = text.toLowerCase();

        ensureUserMemory(userId);
        saveUserMessage(userId, text);

        userMemory[userId].messageCount++;
        const msgCount = userMemory[userId].messageCount;
        const showFooter = msgCount === 1 || msgCount % 10 === 0;

        // HELP
        const noSpace = lower.replace(/\s+/g, "");
        if (helpVariants.some(v => noSpace.includes(v.replace(/\s+/g, "")))) {
          const helpText = `✳️This are the current commands you can try: 

📜Ai say 
E.g "Ai say banana"

📜Roast me

📜Ai picture of ___
E.g "Ai pictures of anime please"

📜Ai motivate me

--- KleinBot, your personal tambay kachikahan.❤️ ---
-KleinDindin`;

          const sent = await sendTextReply(userId, helpText, PAGE_ACCESS_TOKEN, false);
          saveBotMessage(userId, sent);
          continue;
        }

        // CREATOR
        if (creatorFullVariants.some(v => noSpace.includes(v.replace(/\s+/g, "")))) {
          const sent = await sendTextReply(
            userId,
            FIXED_CREATOR_REPLY,
            PAGE_ACCESS_TOKEN,
            showFooter
          );
          saveBotMessage(userId, sent);
          continue;
        }

        // BOT NAME
        if (botNameVariants.some(v => noSpace.includes(v.replace(/\s+/g, "")))) {
          const botReply = "Yes? I'm here! 🤖💛";
          const sent = await sendTextReply(
            userId,
            botReply,
            PAGE_ACCESS_TOKEN,
            showFooter
          );
          saveBotMessage(userId, sent);
          continue;
        }

        // "Klein"
        if (singleKlein.includes(lower)) {
          const clarify = "Uhm, are you talking about me, KleinBot, or my creator? 🤭";
          const sent = await sendTextReply(
            userId,
            clarify,
            PAGE_ACCESS_TOKEN,
            showFooter
          );
          saveBotMessage(userId, sent);
          continue;
        }

        // === AI SAY (VOICE) ===
        const voiceMatch = text.match(voiceRegex);
        if (voiceMatch) {
          const spoken = voiceMatch[1];

          const audio = await generateElevenLabsVoice(spoken);

          if (!audio) {
            const fallback = "Sorry, I can't generate audio right now 😭 try again later!";
            const sent = await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          const attach = await uploadAttachment(audio, PAGE_ACCESS_TOKEN);

          if (attach) {
            await safeFetch(
              `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipient: { id: userId },
                  messaging_type: "RESPONSE",
                  message: {
                    attachment: { type: "audio", payload: { attachment_id: attach } }
                  }
                })
              }
            );
            saveBotMessage(userId, `🎤 Sent audio: "${spoken}"`);
          } else {
            const fallback = "Sorry, I can't generate audio right now 😭 try again later!";
            const sent = await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, showFooter);
            saveBotMessage(userId, sent);
          }
          continue;
        }

        // IMAGE SEARCH
        if (lower.includes("picture") || lower.includes("image") ||
            lower.includes("photo") || lower.includes("pic")) {
          const q = encodeURIComponent(text);
          const link = `https://www.google.com/search?q=${q}&tbm=isch`;
          const reply = `📸 Here you go!\n${link}`;
          const sent = await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, showFooter);
          saveBotMessage(userId, sent);
          continue;
        }

        // ROAST ME
        if (lower.includes("roast me")) {
          const roast = pickRoast();
          const sent = await sendTextReply(userId, roast, PAGE_ACCESS_TOKEN, showFooter);
          saveBotMessage(userId, sent);
          continue;
        }

        // WHO MADE YOU
        if (lower.includes("who made") ||
            lower.includes("who created") ||
            lower.includes("gumawa sayo") ||
            lower.includes("sino gumawa sayo")) {
          const reply = "I was proudly made by a Grade 12 TVL-ICT student named Klein Dindin 🤖🔥";
          const sent = await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, showFooter);
          saveBotMessage(userId, sent);
          continue;
        }

        // NORMAL AI REPLY
        const memory = buildMemoryContext(userId);
        const aiReply = await getAIReply(OPENAI, text, memory);

        const final = await sendTextReply(
          userId,
          aiReply,
          PAGE_ACCESS_TOKEN,
          showFooter
        );

        saveBotMessage(userId, final);
      }
    }

    return res.send("EVENT_RECEIVED");

  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("Server Error");
  }
}

// extra filler lines to maintain structure
                
