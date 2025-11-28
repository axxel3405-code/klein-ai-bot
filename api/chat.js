// TEMPORARY MEMORY STORAGE (per user)
const userMemory = {};
const MAX_MEMORY = 10;

export default async function handler(req, res) {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  // ------------------------------
  //  WEBHOOK VERIFICATION (GET)
  // ------------------------------
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

  // ------------------------------
  //  MESSAGE HANDLER (POST)
  // ------------------------------
  if (req.method === "POST") {
    const body = req.body;

    if (body.object === "page") {
      for (const entry of body.entry) {
        const event = entry.messaging[0];

        if (event.message && event.message.text) {
          const userId = event.sender.id;
          const userMessageRaw = event.message.text;
          const userMessage = userMessageRaw.toLowerCase();

          // --------------------------------------
          // MEMORY INITIALIZATION
          // --------------------------------------
          if (!userMemory[userId]) {
            userMemory[userId] = {
              user: [],
              bot: [],
              lastActive: Date.now()
            };
          }

          // RESET IF INACTIVE FOR 1 HOUR
          if (Date.now() - userMemory[userId].lastActive > 3600000) {
            userMemory[userId] = { user: [], bot: [], lastActive: Date.now() };
          }

          // Save user message
          userMemory[userId].user.push(userMessageRaw);
          if (userMemory[userId].user.length > MAX_MEMORY) {
            userMemory[userId].user.shift();
          }

          userMemory[userId].lastActive = Date.now();

          // -----------------------------------
          // AI SAY → VOICE MESSAGE (FREE GOOGLE TTS)
          // -----------------------------------
          const voiceTriggers = ["ai say", "ai sey", "aisay", "a.i say", "ai  say"];

          const triggerFound = voiceTriggers.some(t => userMessage.startsWith(t));

          if (triggerFound) {
            const spokenText = userMessageRaw.replace(/ai say/i, "").trim();

            if (!spokenText) {
              const reply = "What do you want me to say in voice? 😄🎤";
              await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
              saveBotMemory(userId, reply);
              continue;
            }

            try {
              const audioBuffer = await generateVoice(spokenText);

              await sendAudio(userId, audioBuffer, PAGE_ACCESS_TOKEN);

              const reply = `🎤 Here's how "${spokenText}" sounds!`;
              saveBotMemory(userId, reply);
            } catch (e) {
              const fallback = `Sori, hindi makagawa ng audio ngayon. Narito ang sinabi ko: "${spokenText}"`;
              await sendMessage(userId, fallback, PAGE_ACCESS_TOKEN);
              saveBotMemory(userId, fallback);
            }
            continue;
          }

          // -----------------------------------
          // WHO MADE YOU FEATURE
          // -----------------------------------
          const creatorQuestions = [
            "who made you", "who make you", "who created you",
            "sino gumawa sayo", "sino gumawa sa'yo", "gumawa sayo"
          ];

          if (creatorQuestions.some(q => userMessage.includes(q))) {
            const reply = "I was proudly made by **Klein Dindin**, a Grade 12 TVL-ICT student. 🤖🔥";
            await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
            saveBotMemory(userId, reply);
            continue;
          }

          // -----------------------------------
          // IMAGE SEARCH FEATURE
          // -----------------------------------
          if (userMessage.includes("picture") || userMessage.includes("image")) {
            const query = encodeURIComponent(userMessage);
            const link = `https://www.google.com/search?q=${query}&tbm=isch`;

            const reply = `📸 Here you go!\n${link}`;
            await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
            saveBotMemory(userId, reply);
            continue;
          }

          // -----------------------------------
          // DEVIL ROAST MODE
          // -----------------------------------
          if (userMessage.includes("roast me")) {
            const roasts = [
              "Embes na pag-aralan mo ni AI mopa talaga. 🤮🤮",
              "Sa sobrang hina mo, kahit calculator umiiyak pag ikaw gamit. 😭🧮",
              "Utak mo parang WiFi sa probinsya — mahina, putol-putol, minsan wala talaga. 📶💀",
              "Ni nanay at tatay mo hirap ka i-defend sa barangay. 🤣🔥",
              "Ikaw lang tao na kahit hindi gumagalaw, nakakapagod panoorin. 😭💀",
              "Kung katangahan currency, bilyonaryo ka na. 💸🧠",
              "Mas sharp pa plastic spoon kesa reasoning mo. 🥄😭",
              "Nagre-request ka ng roast? Anak, roasted ka na sa buhay pa lang. 🔥💀",
              "Kung braincells mo empleyado, naka day-off lahat. 🧠🏖️"
            ];

            const roast = roasts[Math.floor(Math.random() * roasts.length)];

            await sendMessage(userId, roast, PAGE_ACCESS_TOKEN);
            saveBotMemory(userId, roast);
            continue;
          }

          // -----------------------------------------
          // NORMAL OPENAI AI RESPONSE WITH MEMORY
          // -----------------------------------------
          const memoryContext = buildMemoryContext(userMemory[userId]);

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
                  content: `You are KleinBot, a funny Filipino chatbot with short replies and emojis.

Here is the user's memory:
${memoryContext}

Use the memory naturally.`
                },
                { role: "user", content: userMessageRaw }
              ]
            }),
          });

          const aiData = await aiResponse.json();
          const reply = aiData?.choices?.[0]?.message?.content || "Sorry, nagka-error ako 😭";

          await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
          saveBotMemory(userId, reply);
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.status(404).send("Not Found");
  }

  return res.status(405).send("Method Not Allowed");
}

// --------------------------------------------------
// SAVE BOT MESSAGE TO MEMORY
// --------------------------------------------------
function saveBotMemory(userId, message) {
  userMemory[userId].bot.push(message);
  if (userMemory[userId].bot.length > MAX_MEMORY) {
    userMemory[userId].bot.shift();
  }

  userMemory[userId].lastActive = Date.now();
}

// --------------------------------------------------
// FORMAT MEMORY INTO TEXT
// --------------------------------------------------
function buildMemoryContext(memoryObj) {
  let context = "";

  memoryObj.user.forEach((msg, i) => {
    context += `User: ${msg}\n`;
    if (memoryObj.bot[i]) {
      context += `Bot: ${memoryObj.bot[i]}\n`;
    }
  });

  return context.trim();
}

// --------------------------------------------------
// FREE GOOGLE TTS (MP3 OUTPUT)
// --------------------------------------------------
async function generateVoice(text) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
    text
  )}&tl=tl&client=tw-ob`; // TL = Tagalog (auto works even with English)

  const resp = await fetch(url);
  const array = await resp.arrayBuffer();
  return Buffer.from(array);
}

// --------------------------------------------------
// SEND AUDIO TO MESSENGER
// --------------------------------------------------
async function sendAudio(recipientId, audioBuffer, PAGE_ACCESS_TOKEN) {
  const formData = new FormData();
  formData.append("recipient", JSON.stringify({ id: recipientId }));
  formData.append("message", JSON.stringify({ attachment: { type: "audio", payload: {} } }));
  formData.append("filedata", new Blob([audioBuffer]), "voice.mp3");

  await fetch(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      body: formData
    }
  );
}

// --------------------------------------------------
// SEND TEXT MESSAGE
// --------------------------------------------------
async function sendMessage(id, text, PAGE_ACCESS_TOKEN) {
  await fetch(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id },
        message: { text }
      })
    }
  );
}
