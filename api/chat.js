// pages/api/chat.js
// FULL FINAL: All features included (Vercel-ready, no Express)

// === CONFIG / MEMORY ===
const MAX_MEMORY = 10;
const INACTIVITY_MS = 3600000; // 1 hour

// In-memory store: { [userId]: { user: [{text,ts}], bot: [{text,ts}], lastActive, messageCount } }
const userMemory = {};

// === HELPERS ===
function ensureUserMemory(userId) {
  if (!userMemory[userId]) {
    userMemory[userId] = { user: [], bot: [], lastActive: Date.now(), messageCount: 0 };
  }
  // reset after inactivity (also reset messageCount)
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

// === FOOTER SETUP ===
const FOOTER = `\n\n\nUse <GptHelp> command to see all of the current commands.`;

// helper to append footer to a text reply (avoid double-footer)
function buildFooterText(text) {
  if (!text) return FOOTER.trim();
  if (text.includes(FOOTER)) return text;
  return `${text}${FOOTER}`;
}

// low-level send text (wraps Messenger API)
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

// high-level: send text reply, optionally append footer
async function sendTextReply(recipientId, text, PAGE_ACCESS_TOKEN, appendFooter = false) {
  const final = appendFooter ? buildFooterText(text) : text;
  await sendMessage(recipientId, final, PAGE_ACCESS_TOKEN);
  return final;
}

// === TRIGGERS & VARIANTS ===

// Voice trigger regex (robust)
const voiceRegex = /^(?:ai[\s.\-]*say|a\.i[\s.\-]*say|aisay|ai-say|ai\s+sey)\s+(.+)$/i;

// Help feature variants (magic word variants)
const helpVariants = [
  "gpthelp", "gpt help", "gpt-help",
  "kleinhelp", "klein help", "klein-help",
  "help kleinbot", "help klein", "kbhelp"
];

// Creator full-name variants
const creatorFullVariants = [
  "klein dindin", "kleindindin", "rjklein", "rjdindin",
  "rj klein", "rj dindin", "dindin klein", "klein dindin"
];

// Bot name variants
const botNameVariants = [
  "kleinbot", "klein bot", "klein_bot", "kleinbot!",
  "klein-bot"
];

// single-word klein
const singleKlein = ["klein"];

// Exact fixed creator reply
const FIXED_CREATOR_REPLY = "Oh! You're talking about my creator, well he's busy rn, nag lulu pasya 🙏\nBut I'm here you can talk to me. ❤️🤩";

// 55 roasts
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
  "Kung katangahan currency, bilyonaryo ka na. 💸🧠",
  "Mas sharp pa plastic spoon kesa reasoning mo. 🥄😭",
  "Kahit ghosting, di mo alam — kasi lahat sayo nag-iignore. 👻💔",
  "Kung braincells mo empleyado, naka day-off lahat. 🧠🏖️",
  "Nagpapanggap kang may plano? Parang papel sa ulan — dali-daling nawawala. 🌧️📄",
  "Pag-aralan mo hinde yung pinapagod mo kami sa pagsasagot diyan sa mga essays mo. 🤮💀",
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
  "Kung patangahan ang exam, passing grade ka. 🎓💀",
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
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text
  )}&tl=auto&client=tw-ob`;
  const resp = await safeFetch(ttsUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!resp.ok) throw new Error("Google TTS failed");
  const array = await resp.arrayBuffer();
  return Buffer.from(array);
}

// === SEND AUDIO TO MESSENGER
async function sendAudio(recipientId, audioBuffer, PAGE_ACCESS_TOKEN) {
  const form = new FormData();
  form.append("recipient", JSON.stringify({ id: recipientId }));
  form.append("message", JSON.stringify({ attachment: { type: "audio", payload: {} } }));
  form.append("filedata", new Blob([audioBuffer], { type: "audio/mpeg" }), "voice.mp3");

  const resp = await safeFetch(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    { method: "POST", body: form }
  );
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "no-body");
    throw new Error("Messenger audio upload failed: " + txt);
  }
}

// === Call OpenAI Chat
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
    const txt = await resp.text().catch(() => "no-body");
    console.error("OpenAI chat error:", resp.status, txt);
    return "Sorry, nagka-error ako 😭";
  }
  const data = await resp.json();
  return data?.choices?.[0]?.message?.content ?? "Sorry, nagka-error ako 😭";
}

// === WEBHOOK HANDLER
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
          if (!event.message || !event.sender?.id) continue;
          if (!event.message.text) continue;

          const userId = event.sender.id;
          const rawText = event.message.text;
          const text = rawText.trim();
          const textLower = text.toLowerCase();

          // ensure memory + increment user message counter
          ensureUserMemory(userId);
          saveUserMessage(userId, text);
          userMemory[userId].messageCount = (userMemory[userId].messageCount || 0) + 1;
          const currentMsgCount = userMemory[userId].messageCount;

          // determine if footer should be appended:
          // footer only on first message (count === 1) OR every 10th (count % 10 === 0)
          const shouldAppendFooterByCount =
            currentMsgCount === 1 || (currentMsgCount % 10 === 0);

          // === NEW HELP FEATURE (GptHelp) ===
          const normalizedHelp = textLower.replace(/\s+/g, "");
          const isHelp = helpVariants.some(v => normalizedHelp.includes(v.replace(/\s+/g, "")));

          if (isHelp) {
            const helpReply =
`✳️This are the current commands you can try: 

📜Ai say 
E.g "Ai say banana"

📜Roast me
(Current roasts are mostly tagalog)

📜Ai picture of ___
E.g "Ai pictures of anime please"

📜Ai motivate me

--- KleinBot is still improving, not much features right now because we're using Free-Plan OPEN-AI API Model. Have a wonderful day and enjoy chatting with KleinBot, your personal tambay kachikahan.❤️ ---
-KleinDindin`;
            // GptHelp must NOT have the footer appended (explicit requirement)
            const finalHelp = helpReply;
            await sendTextReply(userId, finalHelp, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, finalHelp);
            continue;
          }

          // === Creator name detection ===
          const normalizedNoSpace = textLower.replace(/\s+/g, "");
          const isCreator = creatorFullVariants.some(
            v => normalizedNoSpace.includes(v.replace(/\s+/g, ""))
          );
          if (isCreator) {
            const finalCreator = buildFooterText(FIXED_CREATOR_REPLY);
            // Creator reply should include footer only if shouldAppendFooterByCount is true
            const sendCreator = shouldAppendFooterByCount
              ? await sendTextReply(userId, FIXED_CREATOR_REPLY, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, FIXED_CREATOR_REPLY, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendCreator);
            continue;
          }

          // === Bot name detection ===
          const isBotName = botNameVariants.some(
            v => normalizedNoSpace.includes(v.replace(/\s+/g, ""))
          );
          if (isBotName) {
            const botReply = "Yes? I'm here! 🤖💛";
            const sendBotName = shouldAppendFooterByCount
              ? await sendTextReply(userId, botReply, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, botReply, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendBotName);
            continue;
          }

          // === single-word klein ===
          if (singleKlein.includes(textLower)) {
            const clarify = "Uhm, are you talking about me, KleinBot, or my creator? Let me know 🤩";
            const sendClarify = shouldAppendFooterByCount
              ? await sendTextReply(userId, clarify, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, clarify, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendClarify);
            continue;
          }

          // === Voice trigger ===
          const voiceMatch = text.match(voiceRegex);
          if (voiceMatch) {
            const spokenText = voiceMatch[1].trim();
            if (!spokenText) {
              const reply = "What do you want me to say in voice? 😄🎤";
              // this is text fallback (not TTS); footer rules apply
              const sendFallback = shouldAppendFooterByCount
                ? await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, true)
                : await sendTextReply(userId, reply, PAGE_ACCESS_TOKEN, false);
              saveBotMessage(userId, sendFallback);
              continue;
            }
            try {
              const audioBuffer = await generateVoiceMP3(spokenText);
              // send only audio (no footer for audio-only responses)
              await sendAudio(userId, audioBuffer, PAGE_ACCESS_TOKEN);
              // Save an internal note (no footer) about the audio send
              saveBotMessage(userId, `🎤 Sent audio: "${spokenText}"`);
            } catch (err) {
              console.error("TTS/sendAudio error:", err);
              const fallback = `Sori, hindi makagawa ng audio ngayon. Narito ang sinabi ko: "${spokenText}"`;
              // fallback is text; footer rules apply
              const sendFallback = shouldAppendFooterByCount
                ? await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, true)
                : await sendTextReply(userId, fallback, PAGE_ACCESS_TOKEN, false);
              saveBotMessage(userId, sendFallback);
            }
            continue;
          }

          // === Image search ===
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

          // === Roast me ===
          if (textLower.includes("roast me")) {
            const roast = pickRoast();
            const sendRoast = shouldAppendFooterByCount
              ? await sendTextReply(userId, roast, PAGE_ACCESS_TOKEN, true)
              : await sendTextReply(userId, roast, PAGE_ACCESS_TOKEN, false);
            saveBotMessage(userId, sendRoast);
            continue;
          }

          // === Who made you ===
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

          // === Normal AI reply ===
          const memoryContext = buildMemoryContext(userId);
          const aiReply = await getAIReply(OPENAI_API_KEY, text, memoryContext);
          // Ensure GptHelp content is not accidentally returned by AI — if it returns that same help block, we still must NOT append footer if it's the GptHelp content exactly.
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

          // If AI returned the exact help block, treat it like help (no footer)
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
    
