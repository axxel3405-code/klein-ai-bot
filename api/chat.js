import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(bodyParser.json());

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// SEND MESSAGE
async function sendMessage(sender_psid, response) {
  try {
    await axios.post(
      `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: sender_psid },
        message: response,
      }
    );
  } catch (err) {
    console.error("Send message error:", err.response?.data || err.message);
  }
}

// FORBIDDEN WORDS (to block NSFW searches)
const forbiddenWords = [
  "porn", "sex", "nude", "hentai", "xxx", "nsfw", "adult", "69",
  "pussy", "cock", "blowjob", "anal"
];

function isBadQuery(text) {
  return forbiddenWords.some(word => text.toLowerCase().includes(word));
}

// GOOGLE SEARCH BUILDER
function googleSearchLink(query) {
  const encoded = encodeURIComponent(query);
  return `https://www.google.com/search?q=${encoded}`;
}

// MAIN BOT LOGIC
async function handleMessage(sender_psid, message) {
  const text = message.text?.trim() || "";
  const lower = text.toLowerCase();

  // -------------------------------------------------------------
  // 1. "WHO MADE YOU?" MULTI-LANGUAGE DETECTOR
  // -------------------------------------------------------------
  const creatorTriggers = [
    "who made you",
    "who make you",
    "who created you",
    "sino gumawa sayo",
    "sino gumawa sa'yo",
    "gumawa sayo",
    "gumawa sa'yo",
    "gumawa sayo?",
    "gumawa sa'yo?"
  ];

  if (creatorTriggers.some(t => lower.includes(t))) {
    return sendMessage(sender_psid, {
      text: "I was made by a Grade 12 TVL-ICT student named Klein Dindin 😁."
    });
  }

  // -------------------------------------------------------------
  // 2. MAGIC SEARCH WORD SYSTEM
  // Example: "anime pictures", "cat images", "blue wallpaper"
  // -------------------------------------------------------------
  const pictureTriggers = [
    "picture", "pictures",
    "images", "image",
    "wallpaper", "wallpapers"
  ];

  // If user message contains one of the picture trigger words
  if (pictureTriggers.some(w => lower.includes(w))) {

    if (isBadQuery(lower)) {
      return sendMessage(sender_psid, {
        text: "Sorry 😅 I can't search that. Try something safer!"
      });
    }

    // Remove filler words like "please"
    const cleaned = lower.replace("please", "").trim();

    const searchQuery = cleaned;

    const link = googleSearchLink(searchQuery);

    return sendMessage(sender_psid, {
      text: `Here you go! 🔍😊\nI searched **${searchQuery}** for you:\n👉 ${link}`
    });
  }

  // -------------------------------------------------------------
  // 3. FRIENDLY DEFAULT REPLY
  // -------------------------------------------------------------
  return sendMessage(sender_psid, {
    text:
      "Got it! 😊\n" +
      "Let me help you with that.\n\n" +
      "TIP: Want pictures? Just type something like:\n" +
      `"Anime pictures"\n"Sunset wallpaper"\n"Car images"\n\n` +
      "I’ll send you a Google link! 🔎✨"
  });
}

// WEBHOOK VERIFY
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// WEBHOOK RECEIVE MESSAGE
app.post("/webhook", (req, res) => {
  const body = req.body;

  if (body.object === "page") {
    body.entry.forEach(entry => {
      let event = entry.messaging[0];
      let sender_psid = event.sender.id;

      if (event.message) {
        handleMessage(sender_psid, event.message);
      }
    });

    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// START SERVER
app.listen(3000, () => console.log("KleinBot server running!"));
