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
          const userMessage = event.message.text.toLowerCase();

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

          // RESET MEMORY IF INACTIVE FOR 1 HOUR
          if (Date.now() - userMemory[userId].lastActive > 3600000) {
            userMemory[userId] = { user: [], bot: [], lastActive: Date.now() };
          }

          // Save new user message
          userMemory[userId].user.push(userMessage);
          if (userMemory[userId].user.length > MAX_MEMORY) {
            userMemory[userId].user.shift();
          }

          userMemory[userId].lastActive = Date.now();

          // -----------------------------------
          // 1. WHO MADE YOU FEATURE
          // -----------------------------------
          const creatorQuestions = [
            "who made you", "who make you", "who created you",
            "sino gumawa sayo", "sino gumawa sa'yo", "gumawa sayo"
          ];

          if (creatorQuestions.some(q => userMessage.includes(q))) {
            const reply = "I was proudly made by a Grade 12 TVL-ICT student named **Klein Dindin** 🤖🔥";

            await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
            saveBotMemory(userId, reply);
            continue;
          }

          // -----------------------------------
          // 2. GOOGLE IMAGE SEARCH
          // -----------------------------------
          if (userMessage.includes("pictures") || userMessage.includes("image")) {
            const query = encodeURIComponent(userMessage);
            const link = `https://www.google.com/search?q=${query}&tbm=isch`;

            const reply = `Here you go! 🔍✨\nI found something for you:\n${link}`;

            await sendMessage(userId, reply, PAGE_ACCESS_TOKEN);
            saveBotMemory(userId, reply);
            continue;
          }

          // -----------------------------------
          // 3. DEVIL ROAST MODE (REPEAT ALLOWED)
          // Trigger: "roast me"
          // -----------------------------------
          if (userMessage.includes("roast me")) {
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
              "Kung braincells mo empleyado, naka day-off lahat. 🧠🏖️"
            ];

            const roast = roasts[Math.floor(Math.random() * roasts.length)];

            await sendMessage(userId, roast, PAGE_ACCESS_TOKEN);
            saveBotMemory(userId, roast);
            continue;
          }

          // -----------------------------------------
          // 4. NORMAL AI RESPONSE (WITH MEMORY)
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
                  content: `You are KleinBot, a warm, funny Filipino chatbot with short replies and emojis.
                  
Here is the user memory (last 10 messages):
${memoryContext}

Use this memory naturally when replying.`
                },
                { role: "user", content: userMessage }
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
// SEND MESSAGE TO FACEBOOK
// --------------------------------------------------
async function sendMessage(id, text, PAGE_ACCESS_TOKEN) {
  await fetch(
    `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id },
        message: { text },
      }),
    }
  );
        }
