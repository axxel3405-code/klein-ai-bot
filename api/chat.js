// KleinBot FINAL with FALLBACK NAME SYSTEM (based on chat 6.js + name injection + fallback)
// Ai-say priority, C1 creator logic, roast/name support, footer logic, memory, advanced name fallback.
// Under 470 lines.

const MAX_MEMORY = 10;
const INACTIVITY_MS = 3600000;
const userMemory = {};

function ensureUserMemory(id){
  if(!userMemory[id]){
    userMemory[id]={user:[],bot:[],lastActive:Date.now(),messageCount:0,firstName:null};
  }
  if(Date.now()- (userMemory[id].lastActive||0)>INACTIVITY_MS){
    userMemory[id]={user:[],bot:[],lastActive:Date.now(),messageCount:0,firstName:null};
  }
  userMemory[id].lastActive=Date.now();
}

function saveUserMessage(id,text){
  ensureUserMemory(id);
  userMemory[id].user.push({text,ts:Date.now()});
  if(userMemory[id].user.length>MAX_MEMORY) userMemory[id].user.shift();
}

function saveBotMessage(id,text){
  ensureUserMemory(id);
  userMemory[id].bot.push({text,ts:Date.now()});
  if(userMemory[id].bot.length>MAX_MEMORY) userMemory[id].bot.shift();
}

function buildMemoryContext(id){
  ensureUserMemory(id);
  const u=userMemory[id].user,b=userMemory[id].bot,lines=[];
  const m=Math.max(u.length,b.length);
  for(let i=0;i<m;i++){
    if(u[i]) lines.push(`User: ${u[i].text}`);
    if(b[i]) lines.push(`Bot: ${b[i].text}`);
  }
  if(userMemory[id].firstName){
    lines.push(`StoredUserName: ${userMemory[id].firstName}`);
  }
  return lines.join("\n");
}

async function safeFetch(u,o){ return fetch(u,o); }

const FOOTER="\n\n\nUse <GptHelp> command to see all of the current commands.";
function buildFooterText(t){ if(!t)return FOOTER.trim(); if(t.includes(FOOTER))return t; return t+FOOTER; }

async function sendMessage(id,text,TOKEN){
  await safeFetch(`https://graph.facebook.com/v17.0/me/messages?access_token=${TOKEN}`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({recipient:{id},messaging_type:"RESPONSE",message:{text}})
  });
}

async function sendTextReply(id,text,TOKEN,footer){
  const final=footer?buildFooterText(text):text;
  await sendMessage(id,final,TOKEN);
  return final;
}

const voiceRegex=/^(?:ai[\s.\-]*say|aisay|a\.i[\s.\-]*say|ai-say)\s+(.+)$/i;
const helpVariants=["gpthelp","gpt help","kleinhelp","klein help","help kleinbot","help klein","kbhelp"];
const creatorFullVariants=["kleindindin","klein dindin","rj klein","rjdindin","rjklein","rj dindin","dindin klein"];
const botNameVariants=["kleinbot","klein bot","klein-bot","klein_bot"];
const singleKlein=["klein"];

const FIXED_CREATOR_REPLY=
"Oh! You're talking about my creator, well he's busy rn, nag lulu pasya 🙏\nBut I'm here you can talk to me. ❤️🤩";

const ROASTS=[
"Landi gusto ligo ayaw? 🤢🤮",
"Oy bes! Diba ikaw yung nag ra rants kay chatgpt? Kase wlay may interest sa mga kwento mo. 🔥💀",
"Utak mo parang WiFi sa probinsya — mahina, putol-putol, minsan wala talaga. 📶💀",
"Ni nanay at tatay mo hirap ka i-defend sa barangay. 🤣🔥",
"Kung katangahan currency, bilyonaryo ka na. 💸🧠"
];

function pickRoast(){ return ROASTS[Math.floor(Math.random()*ROASTS.length)]; }

const ELEVEN_VOICE_ID="pNInz6obpgDQGcFmaJgB";

async function generateElevenLabsVoice(text){
  try{
    const r=await safeFetch("https://api.elevenlabs.io/v1/text-to-speech/"+ELEVEN_VOICE_ID,{
      method:"POST",headers:{"Content-Type":"application/json","xi-api-key":process.env.ELEVENLABS_API_KEY},
      body:JSON.stringify({
        text,model_id:"eleven_turbo_v2_5",
        voice_settings:{stability:0.5,similarity_boost:0.5}
      })
    });
    if(!r.ok){ console.error("ElevenLabs TTS error:",r.status,await r.text()); return null; }
    const buf=Buffer.from(await r.arrayBuffer());
    return buf.length>0?buf:null;
  }catch(e){ console.error("ElevenLabs exception:",e); return null; }
}

async function uploadAttachment(audio,TOKEN){
  try{
    const f=new FormData();
    f.append("message",JSON.stringify({attachment:{type:"audio",payload:{}}}));
    f.append("filedata",new Blob([audio],{type:"audio/mpeg"}),"voice.mp3");
    const r=await safeFetch(`https://graph.facebook.com/v17.0/me/message_attachments?access_token=${TOKEN}`,{method:"POST",body:f});
    if(!r.ok){ console.error("Attachment upload fail:",r.status,await r.text()); return null; }
    const j=await r.json();
    return j?.attachment_id||null;
  }catch(e){ console.error("uploadAttachment exception:",e); return null; }
}

async function getAIReply(key,msg,memory){
  try{
    const r=await safeFetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body:JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          {role:"system",content:"You are KleinBot, a friendly American-Filipino chatbot with short replies and emojis."},
          {role:"system",content:memory?`Memory:\n${memory}`:""},
          {role:"user",content:msg}
        ],
        max_tokens:300
      })
    });
    if(!r.ok){ console.error("OpenAI API error:",r.status,await r.text()); return "Sorry, nagka-error ako 😭"; }
    const d=await r.json();
    return d?.choices?.[0]?.message?.content||"Sorry, nagka-error ako 😭";
  }catch(e){ console.error("OpenAI exception:",e); return "Sorry, nagka-error ako 😭"; }
}

async function getSkepticalReasoning(openaiKey,userMsg,memory){
  try{
    const systemPrompt=`You are KleinBot. The user is CLAIMING to be your creator.
Produce ONLY the continuation after:
"If yes then"
No repeating. Tone playful-skeptical or apologetic depending on message. Keep 1–3 short sentences.`;
    const r=await safeFetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${openaiKey}`},
      body:JSON.stringify({
        model:"gpt-4o-mini",
        messages:[
          {role:"system",content:systemPrompt},
          {role:"system",content:memory?`Memory:\n${memory}`:""},
          {role:"user",content:`User message: "${userMsg}"`}
        ],
        max_tokens:120,temperature:0.8
      })
    });
    if(!r.ok){ console.error("OpenAI skeptical error:",r.status,await r.text()); return null; }
    const j=await r.json();
    return j?.choices?.[0]?.message?.content?.trim()||null;
  }catch(e){ console.error("skeptical exception:",e); return null; }
}

function isPrimaryCreatorClaim(lower){
  const p=[
    "i'm your creator","im your creator","i am your creator",
    "i'm the creator","im the creator","i am the creator",
    "i'm klein","i am klein","i'm klein dindin","i am klein dindin",
    "im klein dindin","im klein","i made you","i created you","i built you",
    "i coded you","ako gumawa sayo","ako ang gumawa sayo","ako ang creator",
    "ako ang gumawa","ako gumawa","ako gumawa sayo"
  ];
  const t=lower.trim();
  for(const x of p){ if(t.startsWith(x))return true; }
  for(const x of p){ let i=t.indexOf(x); if(i!=-1 && i<=8)return true; }
  if(t.length<=120){ for(const x of p){ if(t.includes(x))return true; } }
  return false;
}

/* =========================
   FALLBACK NAME SYSTEM
   ========================= */
function extractFallbackName(msg){
  const m=msg.trim();
  if(/^my name is\s+([a-z']+)/i.test(m)) return m.match(/^my name is\s+([a-z']+)/i)[1];
  if(/^i am\s+([a-z']+)/i.test(m)) return m.match(/^i am\s+([a-z']+)/i)[1];
  if(/^i'm\s+([a-z']+)/i.test(m)) return m.match(/^i'm\s+([a-z']+)/i)[1];
  if(/^call me\s+([a-z']+)/i.test(m)) return m.match(/^call me\s+([a-z']+)/i)[1];
  return null;
}

function maybeAskName(id,lower){
  if(userMemory[id].firstName) return null;
  if(lower.includes("hello")||lower.includes("hi")||lower.includes("hey")){
    return "By the way, I didn’t catch your name yet — what should I call you? 😄";
  }
  return null;
}

function injectName(id,text){
  const n=userMemory[id].firstName;
  if(!n) return text;
  return `${n}, ${text}`;
}

/* =========================
   MAIN HANDLER
   ========================= */
export default async function handler(req,res){
  const VT=process.env.VERIFY_TOKEN;
  const TOKEN=process.env.PAGE_ACCESS_TOKEN;
  const OPENAI=process.env.OPENAI_API_KEY;

  if(req.method==="GET"){
    if(req.query["hub.verify_token"]===VT) return res.send(req.query["hub.challenge"]);
    return res.status(403).send("Verification failed");
  }
  if(req.method!=="POST") return res.status(405).send("Method Not Allowed");

  try{
    const body=req.body;
    if(!body||body.object!=="page") return res.send("Ignored");
    for(const entry of body.entry||[]){
      for(const event of entry.messaging||[]){
        try{
          if(!event.message?.text) continue;
          const userId=event.sender?.id;
          if(!userId) continue;
          const text=String(event.message.text).trim();
          const lower=text.toLowerCase();
          const noSpace=lower.replace(/\s+/g,"");
          ensureUserMemory(userId);
          saveUserMessage(userId,text);
          userMemory[userId].messageCount++;

          const msgCount=userMemory[userId].messageCount;
          const showFooter=(msgCount===1 || msgCount%10===0);

          /* Try reading Facebook name */
          try{
            const r=await safeFetch(`https://graph.facebook.com/${userId}?fields=first_name&access_token=${TOKEN}`);
            const j=await r.json();
            if(j?.first_name && !userMemory[userId].firstName){
              userMemory[userId].firstName=j.first_name;
            }
          }catch(e){}

          /* Fallback name detection */
          const nameCandidate=extractFallbackName(text);
          if(nameCandidate && !userMemory[userId].firstName){
            userMemory[userId].firstName=nameCandidate.charAt(0).toUpperCase()+nameCandidate.slice(1);
            const reply=`Nice to meet you, ${userMemory[userId].firstName}! 😄`;
            const sent=await sendTextReply(userId,reply,TOKEN,showFooter);
            saveBotMessage(userId,sent);
            continue;
          }

          /* Ask name if unknown */
          const askName=maybeAskName(userId,lower);
          if(askName){
            const sent=await sendTextReply(userId,askName,TOKEN,showFooter);
            saveBotMessage(userId,sent);
            continue;
          }

          /* HELP */
          if(helpVariants.some(v=>noSpace.includes(v.replace(/\s+/g,"")))){
            const help=injectName(userId,
`✳️These are the current commands you can try:

📜 Ai say
E.g "Ai say banana"

📜 Roast me

📜 Ai pictures of ___
E.g "Ai pictures of anime"

📜 Ai motivate me

--- KleinBot, your personal tambay kachikahan. ❤️ ---
- KleinDindin`);
            const sent=await sendTextReply(userId,help,TOKEN,false);
            saveBotMessage(userId,sent);
            continue;
          }

          /* PRIORITY: AI SAY */
          const voiceMatch=text.match(voiceRegex);
          if(voiceMatch){
            const spoken=voiceMatch[1].trim();
            if(!spoken){
              const ask="What do you want me to say in voice? 😄🎤";
              const sent=await sendTextReply(userId,ask,TOKEN,showFooter);
              saveBotMessage(userId,sent); continue;
            }
            const audio=await generateElevenLabsVoice(spoken);
            if(!audio){
              const fail="Sorry, I can't generate audio right now 😭 try again later!";
              const sent=await sendTextReply(userId,fail,TOKEN,showFooter);
              saveBotMessage(userId,sent); continue;
            }
            const att=await uploadAttachment(audio,TOKEN);
            if(!att){
              const fail="Audio upload failed 😭 Try again!";
              const sent=await sendTextReply(userId,fail,TOKEN,showFooter);
              saveBotMessage(userId,sent); continue;
            }
            await safeFetch(
              `https://graph.facebook.com/v17.0/me/messages?access_token=${TOKEN}`,
              {
                method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({
                  recipient:{id:userId},
                  messaging_type:"RESPONSE",
                  message:{attachment:{type:"audio",payload:{attachment_id:att}}}
                })
              }
            );
            saveBotMessage(userId,`🎤 Sent: "${spoken}"`);
            continue;
          }

          /* FIRST PERSON CREATOR LOGIC */
          if(isPrimaryCreatorClaim(lower)){
            const mem=buildMemoryContext(userId);
            const dyn=await getSkepticalReasoning(OPENAI,text,mem);
            const first="Are you really my creator? 🤔";
            const second=dyn?`If yes then ${dyn}`:`If yes then tell me something only my creator would know.`;
            const reply=`${first}\n${second}`;
            const sent=await sendTextReply(userId,reply,TOKEN,showFooter);
            saveBotMessage(userId,sent);
            continue;
          }

          /* THIRD PERSON CREATOR */
          if(creatorFullVariants.some(v=>noSpace.includes(v.replace(/\s+/g,"")))){
            const sent=await sendTextReply(userId,FIXED_CREATOR_REPLY,TOKEN,showFooter);
            saveBotMessage(userId,sent);
            continue;
          }

          /* BOT NAME */
          if(botNameVariants.some(v=>noSpace.includes(v.replace(/\s+/g,"")))){
            const reply=injectName(userId,"Yes? I'm here! 🤖💛");
            const sent=await sendTextReply(userId,reply,TOKEN,showFooter);
            saveBotMessage(userId,sent); continue;
          }

          if(singleKlein.includes(lower)){
            const reply=injectName(userId,"Uhm, are you talking about me or my creator? 🤭");
            const sent=await sendTextReply(userId,reply,TOKEN,showFooter);
            saveBotMessage(userId,sent); continue;
          }

          /* IMAGE SEARCH */
          if(lower.includes("picture")||lower.includes("image")||lower.includes("photo")||lower.includes("pic")){
            const q=encodeURIComponent(text);
            const reply=injectName(userId,`📸 Here you go!\nhttps://www.google.com/search?q=${q}&tbm=isch`);
            const sent=await sendTextReply(userId,reply,TOKEN,showFooter);
            saveBotMessage(userId,sent); continue;
          }

          /* ROAST ME */
          if(lower.includes("roast me")){
            const roast=injectName(userId,pickRoast());
            const sent=await sendTextReply(userId,roast,TOKEN,showFooter);
            saveBotMessage(userId,sent); continue;
          }

          /* WHO MADE YOU */
          if(
            lower.includes("who made")||
            lower.includes("who created")||
            lower.includes("gumawa sayo")||
            lower.includes("sino gumawa sayo")||
            lower.includes("gumawa ng bot")||
            lower.includes("your maker")||
            lower.includes("your dev")||
            lower.includes("dev mo")
          ){
            const rep=injectName(userId,"I was proudly made by a Grade 12 TVL-ICT student named Klein Dindin 🤖🔥");
            const sent=await sendTextReply(userId,rep,TOKEN,showFooter);
            saveBotMessage(userId,sent); continue;
          }

          /* DEFAULT AI */
          const mem=buildMemoryContext(userId);
          let ai=await getAIReply(OPENAI,text,mem);
          ai=injectName(userId,ai);
          const sent=await sendTextReply(userId,ai,TOKEN,showFooter);
          saveBotMessage(userId,sent);

        }catch(e){ console.error("Event handler error:",e); }
      }
    }
    return res.send("EVENT_RECEIVED");
  }catch(e){ console.error("Webhook error:",e); return res.status(500).send("Server Error"); }
}

// filler lines
// filler
// filler
