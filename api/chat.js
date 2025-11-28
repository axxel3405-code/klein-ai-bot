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
          const userMessage = event.message.text.toLowerCase();

          // -----------------------------------
          // 1. SPECIAL FEATURE: WHO MADE YOU?
          // -----------------------------------
          const creatorQuestions = [
            "who made you",
            "who make you",
            "who created you",
            "sino gumawa sayo",
            "sino gumawa sa'yo",
            "sino gumawa sayo?",
            "gumawa sayo",
            "gumawa sa'yo"
          ];

          if (creatorQuestions.some(q => userMessage.includes(q))) {
            await sendMessage(event.sender.id,
              "I was proudly made by a Grade 12 TVL-ICT student named **Klein Dindin** 🤖🔥",
              PAGE_ACCESS_TOKEN
            );
            continue;
          }

          // -----------------------------------
          // 2. GOOGLE SEARCH FEATURE
          // Trigger example: "anime pictures"
          // -----------------------------------
          if (userMessage.includes("pictures") || userMessage.includes("image")) {
            const query = encodeURIComponent(userMessage);
            const link = `https://www.google.com/search?q=${query}&tbm=isch`;

            await sendMessage(
              event.sender.id,
              `Here you go! 🔍✨\nI found something for you:\n${link}`,
              PAGE_ACCESS_TOKEN
            );
            continue;
          }

          // -----------------------------------
          // 3. DEVIL ROAST MODE (LEVEL 999)
          // Trigger: "roast me"
          // -----------------------------------
          if (userMessage.includes("roast me")) {
            const roasts = [

              "PUTANGINA READY KA NA?? 😈🔥",
              "Oy alam mo ba? Sa sobrang hina mo, kahit calculator umiiyak pag ikaw gamit. 😭🧮",
              "Yung utak mo parang WiFi sa probinsya — mahina, putol-putol, minsan wala talaga. 📶💀",
              "Sa sobrang tamad mo, pati multo sa bahay niyo napagod na sa'yo. 👻😮‍💨",
              "Ni nanay at tatay mo hirap ka i-defend sa barangay. 🤣🔥",
              "Ikaw lang kilala kong tao na kahit hindi gumagalaw, nakakapagod panoorin. 😭💀",
              "May potential ka… potential maging warning sign sa iba. ⚠️😈",
              "Mas mabilis pa yung kapalaran mong lumayo kaysa WiFi mong kumonek. 📶💔",
              "Nagre-request ka ng roast? Anak, roasted ka na sa buhay pa lang. 🔥💀",
              "Kung katangahan currency, bilyonaryo ka na. 💸🧠",
              "Ikaw yung tipong pag nag-isip, napapagod buong paligid. 😮‍💨😔",
              "Sa sobrang useless mo, even recycle bin nireject ka. 🗑️🚫",
              "Mas reliable pa horoscope kesa sa decision-making mo. 🔮🤡",
              "Kung may award sa pagiging lost, ikaw yung host ng event. 🧭💀",
              "Naghahanap ka ng pagmamahal? Try mo muna hanapin yung common sense mo. 🧐😂",
              "Sa sobrang awkward mo, pati silence uncomfortable. 😭😬",
              "Ikaw yung reminder kung bakit kailangan ng manual ang toothbrush. 🪥💀",
              "Ang presence mo parang ad sa YouTube — nakakainis at walang relevance. 📺😈",
              "Pag sumagot ka parang maintenance: kailangan ng patience. 🛠️😮‍💨",
              "Ikaw lang kilala kong tao na pag naglakad nagiging bad day ng iba. 🚶‍♂️🔥",
              "Kung utak electric fan, sayo number 0 lang gumagana. 🧠🌀",
              "Kahit ghosting, di mo alam — ikaw kasi laging ini-ignore. 👻💔",
              "Mas matalino pa loading screen kesa sayo. ⏳💀",
              "Yung boses mo parang 144p audio — low quality at nakakastress. 🎧😭",
              "Ikaw yung sample answer kung bakit may 'Do not attempt' sa instructions. 📘😈",
              "Sa sobrang hina mo, pati lapis napuputol pag hawak mo. ✏️😮‍💨",
              "Kung energy level mo battery, 1% pero naka-power save pa. 🔋💀",
              "Yung aura mo parang traffic — walang direction at nakakapagod. 🚦😮‍💨",
              "Sa sobrang lost mo, dapat may GPS ka built-in. 🗺️😂",
              "Ikaw yung tipo ng tao na kahit may plan, magiging disaster pa rin. 📅💥",
              "Kung buhay mo weather report, lagi 'cloudy with zero chance of success'. ☁️💀",
              "Kahit algorithm nalilito sayo. 🤖❓",
              "Kahit AI nagba-buffer bago ka kausapin. ⏳😈",
              "Kung buhay mo movie, tragedy-comedy talaga. 🎬😭",
              "Talent mo? Manggulat ng disappointment. 🏆💔",
              "Yung vibe mo parang printer — laging may issue kahit idle. 🖨️😮‍💨",
              "Pag sinabi mong 'I got this', lahat nagdadasal. 🙏💀",
              "Ikaw yung tipo na pag na-late, wala namang naghanap. 🚶‍♂️💭",
              "Kahit salamin ayaw na mag-reflect sayo — pagod na. 🪞😩",
              "Kung braincells mo empleyado, naka day-off lahat. 🧠🏖️",
              "Sa sobrang slow mo, loading bar mismo nagsasabi 'ikaw na maghintay'. ⏳💀",
              "Mas sharp pa plastic spoon kesa reasoning mo. 🥄😭",
              "Ikaw yung reason bakit may word na 'unfortunately'. 😔📚",
              "Pag nag-advice ka, guaranteed wrong turn. 🛣️❌",
              "Future mo unbothered — di ka niya ina-update. 🔮😬",
              "Kung may IQ sale, lugi ka pa rin. 🧠💸",
              "Rich in spirit ka… kasi wala ka nang ibang meron. 😭🔥",
              "Pwede ka mag-host ng self-sabotage tutorials. 📘💀",
              "Yung decisions mo parang signal sa tuktok — useless. 📶🤣",
              "Mas smooth pa Premiere kagabi kesa personality mo. 💻😈",
              "Motivational quotes napapagod sayo. 📜😮‍💨",
              "Ikaw ang tunay na meaning ng 'sana nag-isip muna'. 🤦‍♂️🔥",
              "Confidence mo parang WiFi — no connection. 📶💔",
              "Sa sobrang chaotic mo, pati demonyo nag-pray-over. 😈🙏",
              "Pag sinabing 'be yourself', dapat may disclaimer. ⚠️😂🔥"
            ];

            const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];

            await sendMessage(event.sender.id, randomRoast, PAGE_ACCESS_TOKEN);
            continue;
          }

          // -----------------------------------------
          // 4. NORMAL AI RESPONSE (FRIENDLY, SHORT)
          // -----------------------------------------
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
                  content: "You are KleinBot, a friendly Filipino chatbot. Keep responses short, warm, affectionate, funny, with emojis. Avoid sexual or harmful content."
                },
                { role: "user", content: userMessage }
              ]
            }),
          });

          const aiData = await aiResponse.json();
          const reply = aiData?.choices?.[0]?.message?.content || "Sorry, nagka-error ako 😭";

          await sendMessage(event.sender.id, reply, PAGE_ACCESS_TOKEN);
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    }

    return res.status(404).send("Not Found");
  }

  return res.status(405).send("Method Not Allowed");
}

// ----------------------------------------------
// SEND MESSAGE FUNCTION
// ----------------------------------------------
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
