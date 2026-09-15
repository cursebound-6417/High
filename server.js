const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "public")));

// Explicitly serve the game at the root URL.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
const rooms = new Map();

const questions = [
  {id:1, text:"Before anything else… what should we call you?"},
  {id:2, text:"Be honest—if you had to describe your life after 10th class in just one sentence, what would you say?"},
  {id:3, text:"What is something you thought you'd definitely accomplish before leaving high school… but still haven't?"},
  {id:4, text:"Close your eyes for a second and think about school. What's the first memory that comes to your mind?"},
  {id:5, text:"What's one school moment you'd happily experience again if you had the chance?"},
  {id:6, text:"And what's one moment you'd erase from your memory if you could?"},
  {id:7, text:"Who was someone in school who changed your life—even if they probably don't realize it?"},
  {id:8, text:"What's something you never said to someone at school, but sometimes wish you had?"},
  {id:9, text:"When you look at your school life now, what do you think you'll miss the most?"},
  {id:10, text:"What's something about you that changed between entering high school and leaving it?"},
  {id:11, text:"If you could send one message to your 10th-class self, what would you say?"},
  {id:12, text:"What's one thing you wish your classmates understood about you?"},
  {id:13, text:"If everyone in this game had to describe you using one word, what word do you think they'd choose?"},
  {id:14, text:"What's one thing you did in school that you'll probably never tell your parents about?"},
  {id:15, text:"If you could relive exactly one day from school, which day would you choose—and why?"},
  {id:16, text:"Who do you think understands you better than you realize?"},
  {id:17, text:"What is one thing you are afraid you'll forget about school as you get older?"},
  {id:18, text:"Imagine everyone here is reading your answers five years from now. What would you want them to know about you?"},
  {id:19, text:"Forget what you're supposed to say. What do you genuinely think your life is going to look like after school?"},
  {id:20, text:"Last one. Who do you think actually created this game—and why do you think they made it?"}
];

function makeRoom() {
  let code;
  do { code = crypto.randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(code));
  rooms.set(code, {host:null, players:new Map(), current:1});
  return code;
}

function broadcast(room) {
  const payload = JSON.stringify({
    type:"state",
    current:room.current,
    questions,
    players:[...room.players.values()].map(p=>({
      id:p.id, name:p.name, answers:p.answers, current:p.current, connected:p.ws && p.ws.readyState===1
    })),
    questions
  });
  if(room.host && room.host.readyState===1) room.host.send(payload);
  for(const p of room.players.values()) if(p.ws && p.ws.readyState===1) p.ws.send(payload);
}

wss.on("connection",(ws)=>{
  let role=null, room=null, player=null;

  ws.on("message",(raw)=>{
    let m; try { m=JSON.parse(raw.toString()); } catch { return; }

    if(m.type==="host_create"){
      const code=makeRoom(); room=rooms.get(code); role="host"; room.host=ws;
      ws.send(JSON.stringify({type:"host_ready",code,questions}));
      broadcast(room); return;
    }

    if(m.type==="host_join"){
      room=rooms.get(String(m.code||"").toUpperCase());
      if(!room){ws.send(JSON.stringify({type:"error",message:"Room not found"}));return;}
      role="host"; room.host=ws; ws.send(JSON.stringify({type:"host_ready",code:String(m.code).toUpperCase(),questions})); broadcast(room); return;
    }

    if(m.type==="player_join"){
      room=rooms.get(String(m.code||"").toUpperCase());
      if(!room){ws.send(JSON.stringify({type:"error",message:"Room not found"}));return;}
      if(room.players.size>=100){ws.send(JSON.stringify({type:"error",message:"This room is full (100 players)."}));return;}
      const id=crypto.randomBytes(8).toString("hex");
      player={id,name:String(m.name||"Player").trim().slice(0,40)||"Player",answers:{},current:1,ws};
      room.players.set(id,player); role="player";
      ws.send(JSON.stringify({type:"player_ready",id,code:String(m.code).toUpperCase(),questions})); broadcast(room); return;
    }

    if(m.type==="submit" && role==="player" && room && player){
      const q=Math.max(1,Math.min(questions.length,Number(m.question)||1));
      if(q!==player.current)return;
      player.answers[q]=String(m.answer||"").slice(0,2000);
      broadcast(room); return;
    }

    if(m.type==="set_player_question" && role==="player" && room && player){
      const q=Math.max(1,Math.min(questions.length,Number(m.question)||1));
      if(q===player.current+1 && Object.prototype.hasOwnProperty.call(player.answers,player.current)){player.current=q;broadcast(room)}
      return;
    }
  });

  ws.on("close",()=>{
    if(role==="player" && room && player){
      player.ws=null; broadcast(room);
    } else if(role==="host" && room && room.host===ws) {
      room.host=null; broadcast(room);
    }
  });
});

server.listen(PORT,()=>console.log(`High School Game running on http://localhost:${PORT}`));
