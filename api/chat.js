// KleinBot - Final api/app.js (chat6 + FirstName Integration)
// - C1 skeptical creator reply (two lines)
// - AI SAY prioritized
// - ElevenLabs Adam voice
// - Auto First Name Detection (Option B: normal replies + roast me)
// - All features preserved, under 470 lines

/* =========================
   CONFIG / MEMORY
   ========================= */
const MAX_MEMORY = 10;
const INACTIVITY_MS = 3600000;
const userMemory = {};

function ensureUserMemory(userId) {
  if (!userMemory[userId]) {
    userMemory[userId] = {
      user: [],
      bot: [],
      firstName: null,
      lastActive: Date.now(),
      messageCount: 0
    };
  }
  if (Date.now() - (userMemory[userId].lastActive || 0) > INACTIVITY_MS) {
    userMemory[userId] = {
      user: [],
      bot: [],
      firstName: null,
      lastActive: Date.now(),
      messageCount: 0
    };
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
  const out = [];
  const max = Math.max(u.length, b.length);
  for (let i = 0; i < max; i++) {
    if (u[i]) out.push("User: " + u[i].text);
    if (b[i]) out.push("Bot: " + b[i].text);
  }
  return out.join("\n");
}

/* =========================
   SAFE FETCH
   ========================= */
async function safeFetch(url, options) {
  return fetch(url, options);
}

/* =========================
   FOOTER / SEND HELPERS
   ========================= */
const FOOTER = "\n\n\nUse <GptHelp> command to see all of the current commands.";

function buildFooterText(text) {
  if (!text) return FOOTER.trim();
  if (text.includes(FOOTER)) return text;
  return text + FOOTER;
}

async function sendMessage(id, text, token) {
  await safeFetch(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id },
        messaging_type: "RESPONSE",
        message: { text }
      })
    }
  );
}

async function sendTextReply(id, text, token, footer = false) {
  const final = footer ? buildFooterText(text) : text;
  await sendMessage(id, final, token);
  return final;
}

/* =========================
   TRIGGERS
   ========================= */
const voiceRegex = /^(?:ai[\s.\-]*say|aisay|a\.i[\s.\-]*say|ai-say)\s+(.+)$/i;

const helpVariants = [
  "gpthelp","gpt help","kleinhelp","klein help",
  "help kleinbot","help klein","kbhelp"
];

const creatorFullVariants = [
  "kleindindin","klein dindin","rj klein","rjdindin",
  "rjklein","rj dindin","dindin klein"
];

const botNameVariants = ["kleinbot","klein bot","klein-bot","klein_bot"];
const singleKlein = ["klein"];

/* Fixed 3rd-person creator reply */
const FIXED_CREATOR_REPLY =
  "Oh! You're talking about my creator, well he's busy rn, nag lulu pasya 🙏\nBut I'm here you can talk to me. ❤️🤩";

/* ROASTS */
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

/* =========================
   ELEVENLABS TTS
   ========================= */
const ELEVEN_VOICE_ID = "pNInz6obpgDQGcFmaJgB";

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

    const buf = Buffer.from(await resp.arrayBuffer());
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/* =========================
   UPLOAD ATTACHMENT
   ========================= */
async function uploadAttachment(buffer, token) {
  try {
    const form = new FormData();
    form.append("message", JSON.stringify({ attachment: { type: "audio", payload: {} } }));
    form.append("filedata", new Blob([buffer], { type: "audio/mpeg" }), "voice.mp3");

    const resp = await safeFetch(
      `https://graph.facebook.com/v17.0/me/message_attachments?access_token=${token}`,
      { method: "POST", body: form }
    );

    if (!resp.ok) return null;
    const json = await resp.json();
    return json?.attachment_id || null;
  } catch {
    return null;
  }
}

/* =========================
   OPENAI NORMAL REPLY
   ========================= */
async function getAIReply(key, userMessage, memory) {
  try {
    const resp = await safeFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are KleinBot, a friendly American-Filipino chatbot with short replies and emojis."
          },
          { role: "system", content: memory ? `Memory:\n${memory}` : "" },
          { role: "user", content: userMessage }
        ],
        max_tokens: 300
      })
    });

    if (!resp.ok) return "Sorry, nagka-error ako 😭";
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || "Sorry, nagka-error ako 😭";
  } catch {
    return "Sorry, nagka-error ako 😭";
  }
}

/* =========================
   SKEPTICAL CREATOR REASONING
   ========================= */
async function getSkepticalReasoning(key, msg, memory) {
  const systemPrompt = `You are KleinBot. The user is CLAIMING to be your creator.
Produce ONLY the continuation AFTER the phrase:
"If yes then"
Do NOT repeat that phrase. Do NOT start with it.
Tone playful-skeptical, apologetic when user complains, excited when praised.
1–3 short sentences only.`;

  try {
    const resp = await safeFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: memory ? `Memory:\n${memory}` : "" },
          { role: "user", content: `User message: "${msg}"` }
        ],
        max_tokens: 120,
        temperature: 0.8
      })
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/* =========================
   CREATOR CLAIM DETECTOR
   ========================= */
function isPrimaryCreatorClaim(lower) {
  const p = [
    "i'm your creator","im your creator","i am your creator",
    "i'm the creator","i am the creator","im the creator",
    "i'm klein","i am klein","im klein","i am klein dindin","im klein dindin",
    "i made you","i created you","i built you","i coded you",
    "ako gumawa sayo","ako ang gumawa sayo","ako ang creator","ako gumawa"
  ];
  const t = lower.trim();
  for (const x of p) if (t.startsWith(x)) return true;
  for (const x of p) { const i = t.indexOf(x); if (i !== -1 && i <= 8) return true; }
  if (t.length <= 120) for (const x of p) if (t.includes(x)) return true;
  return false;
}

/* =========================
   AUTO FIRST NAME FETCH
   ========================= */
async function getUserFirstName(userId, token) {
  try {
    const resp = await safeFetch(
      `https://graph.facebook.com/${userId}?fields=first_name&access_token=${token}`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.first_name || null;
  } catch {
    return null;
  }
}

/* =========================
   MAIN HANDLER
   ========================= */
export default async function handler(req, res) {
  const VERIFY = process.env.VERIFY_TOKEN;
  const PAGE = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI = process.env.OPENAI_API_KEY;

  if (req.method === "GET") {
    return req.query["hub.verify_token"] === VERIFY
      ? res.send(req.query["hub.challenge"])
      : res.status(403).send("Verification failed");
  }
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const body = req.body;
    if (!body || body.object !== "page") return res.send("Ignored");

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        try {
          if (!event.message?.text) continue;

          const userId = event.sender?.id;
          if (!userId) continue;

          ensureUserMemory(userId);
          const text = String(event.message.text).trim();
          const lower = text.toLowerCase();
          const noSpace = lower.replace(/\s+/g, "");

          saveUserMessage(userId, text);

          userMemory[userId].messageCount++;
          const count = userMemory[userId].messageCount;
          const showFooter = count === 1 || count % 10 === 0;

          /* AUTO NAME FETCH */
          if (!userMemory[userId].firstName) {
            const first = await getUserFirstName(userId, PAGE);
            if (first) userMemory[userId].firstName = first;
          }

          /* HELP */
          if (helpVariants.some(v => noSpace.includes(v.replace(/\s+/g, "")))) {
            const helpMsg = `✳️These are the current commands you can try:

📜 Ai say
E.g "Ai say banana"

📜 Roast me

📜 Ai pictures of ___
E.g "Ai pictures of anime"

📜 Ai motivate me

--- KleinBot, your personal tambay kachikahan. ❤️ ---
- KleinDindin`;

            const sent = await sendTextReply(userId, helpMsg, PAGE, false);
            saveBotMessage(userId, sent);
            continue;
          }

          /* AI SAY PRIORITY */
          const m = text.match(voiceRegex);
          if (m) {
            const spoken = m[1]?.trim();
            if (!spoken) {
              const ask = "What do you want me to say in voice? 😄🎤";
              const sent = await sendTextReply(userId, ask, PAGE, showFooter);
              saveBotMessage(userId, sent);
              continue;
            }

            const audio = await generateElevenLabsVoice(spoken);
            if (!audio) {
              const fail = "Sorry, I can't generate audio right now 😭 try again later!";
              const sent = await sendTextReply(userId, fail, PAGE, showFooter);
              saveBotMessage(userId, sent);
              continue;
            }

            const attach = await uploadAttachment(audio, PAGE);
            if (!attach) {
              const fail = "Audio upload failed 😭 Try again!";
              const sent = await sendTextReply(userId, fail, PAGE, showFooter);
              saveBotMessage(userId, sent);
              continue;
            }

            await safeFetch(
              `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recipient: { id: userId },
                  messaging_type: "RESPONSE",
                  message: { attachment: { type: "audio", payload: { attachment_id: attach } } }
                })
              }
            );

            saveBotMessage(userId, `🎤 Sent: "${spoken}"`);
            continue;
          }

          /* FIRST PERSON CREATOR CLAIM */
          if (isPrimaryCreatorClaim(lower)) {
            const mem = buildMemoryContext(userId);
            const dyn = await getSkepticalReasoning(OPENAI, text, mem);

            const first = "Are you really my creator? 🤔";
            const second = dyn
              ? "If yes then " + dyn
              : "If yes then please tell me something only my creator would know.";

            const full = first + "\n" + second;
            const sent = await sendTextReply(userId, full, PAGE, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          /* FIXED CREATOR 3RD PERSON */
          if (creatorFullVariants.some(v => noSpace.includes(v.replace(/\s+/g, "")))) {
            const sent = await sendTextReply(userId, FIXED_CREATOR_REPLY, PAGE, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          /* BOT NAME */
          if (botNameVariants.some(v => noSpace.includes(v.replace(/\s+/g, "")))) {
            const reply = "Yes? I'm here! 🤖💛";
            const sent = await sendTextReply(userId, reply, PAGE, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          /* SINGLE 'KLEIN' */
          if (singleKlein.includes(lower)) {
            const reply = "Uhm, are you talking about me or my creator? 🤭";
            const sent = await sendTextReply(userId, reply, PAGE, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          /* IMAGE SEARCH */
          if (
            lower.includes("picture") ||
            lower.includes("image") ||
            lower.includes("photo") ||
            lower.includes("pic")
          ) {
            const q = encodeURIComponent(text);
            const link = `https://www.google.com/search?q=${q}&tbm=isch`;
            const reply = "📸 Here you go!\n" + link;
            const sent = await sendTextReply(userId, reply, PAGE, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          /* ROAST ME (with name injection) */
          if (lower.includes("roast me")) {
            let roast = pickRoast();
            if (userMemory[userId].firstName) {
              roast = userMemory[userId].firstName + ", " + roast;
            }
            const sent = await sendTextReply(userId, roast, PAGE, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          /* WHO MADE YOU? */
          if (
            lower.includes("who made") ||
            lower.includes("who created") ||
            lower.includes("gumawa sayo") ||
            lower.includes("sino gumawa sayo") ||
            lower.includes("gumawa ng bot") ||
            lower.includes("your maker") ||
            lower.includes("your dev") ||
            lower.includes("dev mo")
          ) {
            const reply =
              "I was proudly made by a Grade 12 TVL-ICT student named Klein Dindin 🤖🔥";
            const sent = await sendTextReply(userId, reply, PAGE, showFooter);
            saveBotMessage(userId, sent);
            continue;
          }

          /* DEFAULT NORMAL AI REPLY (with first name injection) */
          const mem = buildMemoryContext(userId);
          let aiReply = await getAIReply(OPENAI, text, mem);

          // Name injection
          if (userMemory[userId].firstName) {
            aiReply = userMemory[userId].firstName + ", " + aiReply;
          }

          const helpBlock = `✳️These are the current commands you can try:

📜 Ai say
E.g "Ai say banana"

📜 Roast me

📜 Ai pictures of ___
E.g "Ai pictures of anime"

📜 Ai motivate me

--- KleinBot, your personal tambay kachikahan. ❤️ ---
- KleinDindin`;

          const isHelp = aiReply.trim() === helpBlock.trim();
          const useFooter = showFooter && !isHelp;

          const final = await sendTextReply(userId, aiReply, PAGE, useFooter);
          saveBotMessage(userId, final);
        } catch (e) {
          console.error("Event error:", e);
        }
      }
    }
    res.send("EVENT_RECEIVED");
  } catch (e) {
    console.error("Main error:", e);
    res.status(500).send("Server Error");
  }
}

/* ===== fillers ===== */
//
// filler A
// filler B
// filler C
