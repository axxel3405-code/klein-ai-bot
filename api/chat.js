// pages/api/chat.js
// FULL FINAL: All features included (Vercel-ready, no Express)

// === CONFIG / MEMORY ===
const MAX_MEMORY = 10;
const INACTIVITY_MS = 3600000; // 1 hour

// In-memory store: { [userId]: { user: [{text,ts}], bot: [{text,ts}], lastActive } }
const userMemory = {};

// === HELPERS ===
function ensureUserMemory(userId) {
  if (!userMemory[userId]) {
    userMemory[userId] = { user: [], bot: [], lastActive: Date.now() };
  }
  // reset after inactivity
  if (Date.now() - userMemory[userId].lastActive > INACTIVITY_MS) {
    userMemory[userId] = { user: [], bot: [], lastActive: Date.now() };
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

// Format memory into a readable context: pairs of last messages
function buildMemoryContext(userId) {
  ensureUserMemory(userId);
  const u = userMemory[userId].user;
  const b = userMemory[userId].bot;
  let lines = [];
  const max = Math.max(u.length, b.length);
  for (let i = 0; i < max; i++) {
    if (u[i]) lines.push(`User: ${u[i].text}`);
    if (b[i]) lines.push(`Bot: ${b[i].text}`);
  }
  return lines.join("\n");
}

// Simple safe fetch wrapper
async function safeFetch(url, options) {
  return fetch(url, options);
}

// === TRIGGERS & VARIANTS ===

// Voice trigger regex (robust)
const voiceRegex = /^(?:ai[\s.\-]*say|a\.i[\s.\-]*say|aisay|ai-say|ai\s+sey)\s+(.+)$/i;

// Creator full-name variants (must trigger the exact fixed reply)
const creatorFullVariants = [
  "klein dindin", "kleindindin", "rjklein", "rjdindin",
  "rj klein", "rj dindin", "dindin klein", "klein dindin"
];

// Bot name variants (KleinBot) — these should acknowledge the bot
const botNameVariants = [
  "kleinbot", "klein bot", "klein_bot", "kleinbot!",
  "klein-bot"
];

// single-word klein (clarification)
const singleKlein = ["klein"];

// Exact fixed creator reply (never change)
const FIXED_CREATOR_REPLY = "Oh! You're talking about my creator, well he's busy rn, nag lulu pasya 🙏\nBut I'm here you can talk to me. ❤️🤩";

// 55 roasts (array)
const ROASTS = [
  "Oo tama, ikaw yung na motivate tapos kinabukasan wlang ginawa. 🥀💀",
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
  "Nagpapanggap kang may plano? Parang papel sa ulan — dali-daling nawawala. 🌧️📄",
  "Charot ka? Dua-dua lang reply mo, parang buffering video. ⏳📺",
  "Mas malakas pa ang WiFi ng kapitbahay kaysa attention span mo. 📶😅",
  "Ang confidence mo parang expired na noodles — kulang sa laman. 🍜💀",
  "Kahit alarm, pinapatay ka kasi kulang ang urgency. ⏰😴",
  "Mukhang acquainted ka sa failure, best friends na kayo. 🤝😭",
  "Bakit ang sense mo parang second-hand? Ginamit na at walang warranty. 🧾😵",
  "May sense of humor ka? Oo, sa ibang tao. Hindi sa sarili mo. 😂🚫",
  "Pogi points? Wala. Charm? Na-lost na sa GPS. 📍💨",
  "Buto ng jokes mo, walang laman. 🍖😆",
  "Bilog ang mundo, pero hindi umiikot ang bait mo. 🌍🔒",
  "Sana may tutorial para sa social skills mo. Missing steps: 4–12. 📚❌",
  "Magaling ka mag-type, pero hindi mag-isip. Keyboard champion, brain pauper. ⌨️🧠",
  "Parang wifi hotspot mo: open pero walang connection. 🔓📴",
  "Ang sarcasm mo parang instant coffee: mabilis pero walang depth. ☕😬",
  "Nag-aapply ka ba sa pagiging problema? Qualified ka na. 📝😅",
  "Kung katangahan exam, passing grade ka. 🎓💀",
  "Tulong! Nawawala ang logic mo sa traffic. 🚗❌",
  "Nag-level up ka — level: confusing. 🎮❓",
  "Parang pelikula: suspenseful pero walang magandang ending. 🎬😵",
  "Kahit autocorrect, nahihirapan mag-ayos ng lines mo. 📱⛔",
  "Silence is golden, lalo na kapag ikaw na ang nagsalita. 🤫🏆",
  "Beauty sleep? Ikaw, beauty snooze forever. 😴💄",
  "Kung pagod ang utak, ikaw ang certified rest area. 🛣️💤",
  "Bakit ang dating mo parang limited edition: rare at hindi maganda? 🤷‍♂️",
  "You call that a plan? That's a suggestion from chaos. 📋🔥",
  "Mas uso pa ang fake friends kaysa honest advice mo. 🤝🎭",
  "Bakit parang script mo from a cheap teleserye? Drama lang, walang sense. 📺😭",
  "Kung joke ka, ma-viral dahil nakakatawa — sa kanila. Not for you. 📈😅",
  "Ang dating mo parang photocopy: blurred at may noise. 🖨️📉",
  "Kahit GPS, hindi ka ma-trace sa success map. 🗺️❌",
  "Parang Wi-Fi, may password pero walang content. 🔒📶",
  "Bakit parang mood mo naka-airplane mode? Walang signal. ✈️📵",
  "Kung nagpunta ka sa logic store, out of stock. 🏬🚫",
  "Your comeback is delayed like a low-tier courier. 📦🐢",
  "Mas consistent pa ang lag sa game kaysa focus mo. 🎮🕳️",
  "Kung pagiging awkward was a skill, graduate ka with honors. 🏅😬",
  "Kahit meme, na-confuse sa punchline mo. 😂❓",
  "Mas dangerous pa ang iyong ignorance kaysa traffic. 🚦⚠️",
  "Kung charm ay isang currency — ikaw nasa poverty line. 💰😭"
];

// === UTIL: pick random roast ===
function pickRoast() {
  return ROASTS[Math.floor(Math.random() * ROASTS.length)];
}

// === FREE GOOGLE TTS (MP3)
async function generateVoiceMP3(text) {
  // attempt to use auto-detect language. 'tl=auto' works in many regions.
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text
  )}&tl=auto&client=tw-ob`;
  const resp = await safeFetch(ttsUrl, {
    headers: { "User-Agent": "Mozilla/5.0" }, // sometimes required by Google TTS
  });
  if (!resp.ok) {
    throw new Error("Google TTS failed: " + resp.status);
  }
  const array = await resp.arrayBuffer();
  return Buffer.from(array);
}

// === SEND AUDIO TO MESSENGER
async function sendAudio(recipientId, audioBuffer, PAGE_ACCESS_TOKEN) {
  // Build multipart/form-data using FormData / Blob (Vercel supports these)
  const form = new FormData();
  form.append("recipient", JSON.stringify({ id: recipientId }));
  form.append("message", JSON.stringify({ attachment: { type: "audio", payload: {} } }));
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  form.append("filedata", blob, "voice.mp3");

  const resp = await safeFetch(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { method: "POST", body: form }
  );
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("Messenger audio upload failed: " + txt);
  }
}

// === SEND TEXT MESSAGE
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

// === Call OpenAI Chat (normal AI replies)
async function getAIReply(openaiApiKey, userMessage, memoryContext) {
  const body = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are KleinBot, a warm, funny American half Filipino chatbot with short replies and emojis. Use the memory naturally when replying.",
      },
      {
        role: "system",
        content: memoryContext ? `Memory:\n${memoryContext}` : "",
      },
      { role: "user", content: userMessage },
    ],
    max_tokens: 400,
  };

  const resp = await safeFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("OpenAI chat error:", resp.status, txt);
    return "Sorry, nagka-error ako 😭";
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "Sorry, nagka-error ako 😭";
}

// === WEBHOOK HANDLER (Vercel-ready)
export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // verification
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
          if (!event.message || !event.sender || !event.sender.id) continue;
          if (!event.message.text) continue;

          const userId = event.sender.id;
          const rawText = event.message.text || "";
          const text = rawText.trim();
          const textLower = text.toLowerCase();

          // ensure memory
          ensureUserMemory(userId);
          // save user message (original casing)
          saveUserMessage(userId, text);

          // === 1) Creator full-name detection (EXACT FIXED REPLY) ===
          // match if message contains any creator full variant as a word or concatenated
          const normalizedNoSpace = textLower.replace(/\s+/g, "");
          const isCreator = creatorFullVariants.some(v => normalizedNoSpace.includes(v.replace(/\s+/g, "")));
          if (isCreator) {
            await sendMessage(userId, FIXED_CREATOR_REPLY, PAGE_ACCESS_TOKEN);
            saveBotMessage(userId, FIXED_CREATOR_REPLY);
            continue;
          }

          // === 2) Bot name detection (KleinBot variants) ===
          // we check normalized (no-spaces) inclusion for variants
          const normalizedLowerNoSpace = textLower.replace(/\s+/g, "");
          const isBotName = botNameVariants.some(v => normalizedLowerNoSpace.includes(v.replace(/\s+/g, "")));
          if (isBotName) {
            const botReply = "Yes? I'm here! 🤖💛";
            await sendMessage(userId, botReply, PAGE_ACCESS_TOKEN);
            saveBotMessage(userId, botReply);
            continue;
          }

          // === 3) Single-word "klein" clarification ONLY when text exactly equals 'klein' ===
          if (singleKlein.includes(textLower)) {
            const clarify = "Uhm, are you talking about me, KleinBot, or my creator? Let me know 🤩";
            await sendMessage(userId, clarify, PAGE_ACCESS_TOKEN);
            saveBotMessage(userId, clarify);
            continue;
          }

          // === 4) Voice trigger ===
          const voiceMatch = text.match(voiceRegex);
          if (voiceMatch) {
            const spokenText = voiceMatch[1].trim();
            if (!spokenText) {
              const reply = "What do you want me to say in voice? 😄🎤";
              await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
              saveBotMessage(userId, reply);
              continue;
            }

            try {
              const audioBuffer = await generateVoiceMP3(spokenText);
              await sendAudio(userId, audioBuffer, PAGE_ACCESS_TOKEN);
              const reply = `🎤 Here's how "${spokenText}" sounds!`;
              saveBotMessage(userId, reply);
            } catch (err) {
              console.error("TTS/sendAudio error:", err);
              const fallback = `Sori, hindi makagawa ng audio ngayon. Narito ang sinabi ko: "${spokenText}"`;
              await sendMessage(userId, fallback, PAGE_ACCESS_TOKEN);
              saveBotMessage(userId, fallback);
            }
            continue;
          }

          // === 5) Image search trigger (pictures/image/ photo) ===
          if (textLower.includes("picture") || textLower.includes("image") || textLower.includes("photo") || textLower.includes("pic")) {
            const q = encodeURIComponent(text);
            const link = `https://www.google.com/search?q=${q}&tbm=isch`;
            const reply = `📸 Here you go!\n${link}`;
            await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
            saveBotMessage(userId, reply);
            continue;
          }

          // === 6) Roast mode trigger ===
          if (textLower.includes("roast me")) {
            const roast = pickRoast();
            await sendMessage(userId, roast, PAGE_ACCESS_TOKEN);
            saveBotMessage(userId, roast);
            continue;
          }

          // === 7) Who made you trigger ===
          const whoMadeTriggers = ["who made you", "who created you", "who make you", "sino gumawa sayo", "gumawa sayo"];
          if (whoMadeTriggers.some(t => textLower.includes(t))) {
            const reply = "I was proudly made by a Grade 12 TVL-ICT student named Klein Dindin 🤖🔥";
            await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
            saveBotMessage(userId, reply);
            continue;
          }

          // === 8) Normal AI reply (with memory context) ===
          const memoryContext = buildMemoryContext(userId);
          const aiReply = await getAIReply(OPENAI_API_KEY, text, memoryContext);

          await sendMessage(userId, aiReply, PAGE_ACCESS_TOKEN);
          saveBotMessage(userId, aiReply);
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
