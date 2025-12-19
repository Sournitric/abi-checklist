let username=null, userUID=null, roomCode=null, currentFloor=1, doorsState={}, usersCache={}, timerInterval=null, roomExpiresAt=0, userColor=null;
let isUserBanned = false;

const COLOR_MAP={green:"#2ecc71", blue:"#3498db", yellow:"#f1c40f", purple:"#9b59b6"};
const DOORS=[
  { id:"2f_general_office", label:"General Office", floor:2, top:"71.8834%", left:"30.855%" },
  { id:"darkroom", label:"Darkroom", floor:1, top:"77.2353%", left:"74.697%" },
  { id:"infirmary", label:"Infirmary", floor:1, top:"57.7608%", left:"35.7576%" },
  { id:"2f_directors_office", label:"Director's Office", floor:2, top:"86.5%", left:"56%" },
  { id:"post_production", label:"Post-Production Room", floor:1, top:"44.8936%", left:"71.9697%" },
  { id:"editing_room", label:"Editing Room", floor:2, top:"5.17527%", left:"26.5909%" },
  { id:"planning_room", label:"Planning Room", floor:1, top:"38.8046%", left:"43.2955%" }
];

const firebaseConfig = {
  apiKey: "AIzaSyBjCQ0bC17KHnG9ylIszBtaAnnDPLYqBV0",
  authDomain: "abi-checklist.firebaseapp.com",
  databaseURL: "https://abi-checklist-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "abi-checklist",
  storageBucket: "abi-checklist.fuse.appspot.com",
  messagingSenderId: "430189439080",
  appId: "1:430189439080:web:aeab2c9a4e829ea16ab3dd"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const TRUSTED_UIDS = [
    'cn3Dd5FKMQfpyRSljXCmc1R3KJU2',
    '0zyksYUKCPXJmJFrBAAWXC3MMjp2', 
    '1hldQGHp0ORQQJdikQmqr065HiJ2',
    '2fMd9SjS7HXYT6fqErpR2DEpVdR2',
];

const TRUSTED_USERNAMES_UIDS = [
  'cn3Dd5FKMQfpyRSljXCmc1R3KJU2',
  '0zyksYUKCPXJmJFrBAAWXC3MMjp2',
  '1hldQGHp0ORQQJdikQmqr065HiJ2',
  '2fMd9SjS7HXYT6fqErpR2DEpVdR2',
  'b1tFOV7PcFX8Uz2GnVjIwE8Z9ze2',
];

setLobbyLocked(true);
firebase.auth().signInAnonymously()
  .then(res => { 
    userUID = res.user.uid; 
    console.log("UID", userUID); 
    checkBanStatus(); 
    checkStaleRooms(res.user);
  })
  .catch(err => { 
    console.error(err); 
    alert("Firebase authentication failed"); 
  });

const colorSelect=document.getElementById("userColor");
const advancedBtn=document.getElementById("advancedColorBtn");
const advancedInput=document.getElementById("advancedColorInput");

colorSelect.addEventListener("change",()=>updateUserColor(colorSelect.value));
advancedBtn.addEventListener("click",()=>{advancedInput.style.display = advancedInput.style.display==="none"?"inline-block":"none";});
advancedInput.addEventListener("change",()=>{const val=advancedInput.value.trim(); if(/^#([0-9A-Fa-f]{6})$/.test(val)) updateUserColor(val); else alert("Invalid hex code");});

function isUsernameValid(str) {
    const maxLength = 20; 
    const uidToCheck = userUID;
    if (str.length > maxLength) return false;
    
    if (uidToCheck && TRUSTED_USERNAMES_UIDS.includes(uidToCheck)) {
        console.log(`Trusted Username UID (${uidToCheck}): Length and symbol bypass active.`);
        const illegalChars = /[\p{C}]/u; 
        return !illegalChars.test(str); 
    }
    const minLength = 3; 
    if (str.length < minLength) return false;
    const illegalChars = /[\p{C}]/u;
    if (illegalChars.test(str)) return false;
    const allowedPattern = /^[ \p{L}0-9_.-]+$/u; 
    return allowedPattern.test(str);
}

function updateUserColor(colorKeyOrHex){
  if(!roomCode || !userUID) return;
  userColor = COLOR_MAP[colorKeyOrHex] || colorKeyOrHex;
  db.ref(`rooms/${roomCode}/users/${userUID}`).update({ color:userColor });
}

document.getElementById("createBtn").addEventListener("click", createRoom);
document.getElementById("joinBtn").addEventListener("click", joinRoomInput);
document.getElementById("copy-room-btn").addEventListener("click", copyRoomCode);
document.querySelectorAll(".floor-btn").forEach(btn=>btn.addEventListener("click",()=>switchFloor(parseInt(btn.dataset.floor))));

function setLobbyLocked(locked){
  document.getElementById("joinCode").disabled=locked;
  document.getElementById("username").disabled=locked;
  document.querySelectorAll("#createBtn, #joinBtn").forEach(btn=>btn.disabled=locked);
}

function copyRoomCode() {
  if (!roomCode) return;
  navigator.clipboard.writeText(roomCode).then(() => {
    const btn = document.getElementById("copy-room-btn");
    const popup = document.createElement("span");
    popup.className = "copy-popup";
    popup.innerText = "Copied!"; // Shorter text looks cleaner
    
    btn.parentNode.appendChild(popup);
    
    // Centers the popup text above the button
    popup.style.left = (btn.offsetLeft + (btn.offsetWidth / 2) - 20) + "px";
    popup.style.top = (btn.offsetTop - 15) + "px";

    setTimeout(() => popup.remove(), 2000);
  });
}


function createRoom() {
  if (isUserBanned) { alert("Action denied: You are banned from this service."); return; }
  checkStaleRooms(firebase.auth().currentUser, "Starting second check for stale rooms...");

  if (roomCode) { alert("Leave current room first."); return; }
  username = document.getElementById("username").value.trim();
  if (!isUsernameValid(username)) { 
    alert("Username must be 3-20 characters long and cannot contain unusual symbols.");
    return;
  }

  roomCode = Math.random().toString(36).substring(2,7).toUpperCase();
  
  const doors = {};
  DOORS.forEach(d => doors[d.id] = { opened:false, by: userUID, at: Date.now() });

  const initialUser = {};
  initialUser[userUID] = {
      name: username,
      color: userColor || COLOR_MAP.green,
      joinedAt: Date.now()
  };

  const roomData = { 
      createdAt: Date.now(), 
      expiresAt: Date.now() + 4*60*60*1000, 
      doors: doors,
      users: initialUser 
  };
  
  db.ref("rooms/" + roomCode).set(roomData)
    .then(() => joinRoom(roomCode))
    .catch(err => { 
        console.error(err); 
        alert("Failed to create room. " + err.message); 
        roomCode = null;
    });
}

function joinRoomInput() {
  if (isUserBanned) { alert("Action denied: You are banned from this service."); return; }
  checkStaleRooms(firebase.auth().currentUser, "Starting second check for stale rooms...");

    if (roomCode) { alert("Leave current room first."); return; }
    
    username = document.getElementById("username").value.trim();
    if (!isUsernameValid(username)) {
        alert("Username must be 3-20 characters long and cannot contain unusual symbols.");
        return;
    }  
    
    const input = document.getElementById("joinCode").value.trim().toUpperCase();
    if (!input) { alert("Enter room code"); return; }
    
    if (!isUsernameValid(input)) {
        alert("The room code must be 3-20 characters and contain only letters/numbers.");
        return;
    }

    joinRoom(input);
}

function joinRoom(code){
  const roomRef = db.ref("rooms/"+code);
  roomRef.once("value").then(roomSnap=>{
    if(!roomSnap.exists()){ alert("Room not found"); return; }
    const room = roomSnap.val();
    if(Date.now() > room.expiresAt){ alert("Room expired"); return; }

    const usersRef = db.ref(`rooms/${code}/users`);
    usersRef.once("value").then(snap=>{
      const users = snap.val()||{};
      if(Object.entries(users).some(([uid, u]) => uid !== userUID && u.name === username)){
        alert("Name taken");
        return;
      }
      const userRef = db.ref(`rooms/${code}/users/${userUID}`);
      if(!userColor) userColor = COLOR_MAP.green;
      userRef.onDisconnect().remove();
      userRef.set({ name: username, color: userColor, joinedAt: Date.now() });
      roomCode = code;

      document.getElementById("room-code").innerText=code;
      document.getElementById("room-info").classList.remove("hidden");
      document.getElementById("users-list").classList.remove("hidden");
      document.querySelector(".map-container").classList.remove("hidden");
      document.getElementById("floor-buttons").classList.remove("hidden");
      document.getElementById("door-card").classList.remove("hidden");
      document.getElementById("history-card").classList.remove("hidden");
      document.getElementById("color-selector").classList.remove("hidden");
      document.getElementById("input-row").classList.add("hidden");
      currentFloor = 1;

      let previousUsers={};
      usersRef.on("value", snap=>{
        const users = snap.val()||{};
        Object.keys(previousUsers).forEach(uid=>{
          if(!users[uid]){
            const nameLeft = previousUsers[uid].name||"Unknown";
            showNotification(`<b>${nameLeft}</b> left the room`);
          }
        });
        previousUsers={...users};
        usersCache=users;
        const list = Object.values(users).map(u=>`<span style="color:${u.color}; font-weight:bold;">${u.name}</span>`).join(", ");
        document.getElementById("users-list").innerHTML="Users in room: "+(list||"None");
      });

      roomExpiresAt = room.expiresAt;
      if(timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(()=>{
        const remaining = roomExpiresAt - Date.now();
        if(remaining <=0){ document.getElementById("room-timer").innerText="Expired"; leaveRoom(); return; }
        const tSec=Math.floor(remaining/1000), h=Math.floor(tSec/3600), m=Math.floor((tSec%3600)/60), s=tSec%60;
        document.getElementById("room-timer").innerText = `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
      },1000);

      // Load initial door state
      roomRef.child("doors").once("value").then(snap=>{
        doorsState = snap.val()||{};
        renderDoors();
        renderDoorList();
        
        // Only attach the listener AFTER initial load to prevent glitching
        roomRef.child("doors").on("child_changed", snap=>{
          const doorId = snap.key, data = snap.val();
          doorsState[doorId] = data;
          renderDoors();
          renderDoorList();

          if(data.opened){
            const userObj = usersCache?.[data.by];
            const name = userObj?.name||"Unknown";
            const color = userObj?.color||"#fff";
            const door = DOORS.find(d=>d.id===doorId);
            if(door) showNotification(`<span style="color:${color}; font-weight:bold;">${name}</span> opened ${door.label}`);
          }
        });
      });

      roomRef.on("value", snap=>{
        const data = snap.val();
        if(!snap.exists() || data?.deleting){
          const user = usersCache?.[data?.deletedBy];
          const name = user?.name||"Someone";
          const color = user?.color||"#fff";
          showNotification(`<span style="color:${color}; font-weight:bold;">${name}</span> deleted the room`);
          cleanupRoomState();
        }
      });

      roomRef.child("lastAction").on("value", snap=>{
        const action = snap.val();
        if(!action || action.type!=="reset") return;
        const user = usersCache?.[action.by];
        const name = user?.name||"Someone";
        const color = user?.color||"#fff";
        showNotification(`<span style="color:${color}; font-weight:bold;">${name}</span> reset the doors`);
      });

      const historyRef = db.ref(`rooms/${code}/history`);
      historyRef.limitToLast(15).on("value", snap => {
        const list = document.getElementById("history-list");
        list.innerHTML = "";
        const entries = snap.val();
        if (!entries) return;
        Object.values(entries).forEach(e => {
          const user = usersCache?.[e.by];
          const name = user?.name || "Unknown";
          const color = user?.color || "#fff";
          const li = document.createElement("li");
          li.innerHTML = `<span style="color:${color}; font-weight:bold;">${name}</span> ${e.text}`;
          list.appendChild(li);
        });
      });      
    });
  });
}

function optimisticToggleUI(doorId, newState, isRollback = false) {
    const selector = isRollback ? `[data-door-id="${doorId}"]` : "";
    const mapIcon = document.querySelector(`.door-icon${selector}[data-door-id="${doorId}"]`);
    const listItem = document.querySelector(`#door-list li[data-door-id="${doorId}"]`);

    if (mapIcon) {
        mapIcon.classList.toggle("opened", newState);
    }
    if (listItem) {
        listItem.classList.toggle("door-opened", newState);
        listItem.classList.toggle("door-closed", !newState);
    }
}

function renderDoors(){
    const container = document.querySelector(".map-container");
    if(!container || !roomCode) return; 
    
    document.querySelectorAll(".door-icon").forEach(el=>el.remove()); 

    DOORS.forEach(d=>{
        const btn = document.createElement("button");
        btn.classList.add("door-icon");
        const state = doorsState[d.id]||{opened:false};
        if(state.opened) btn.classList.add("opened");
        
        btn.setAttribute("data-door-id", d.id); 
        btn.setAttribute("data-label", d.label); 
        
        // FIX: Remove title to prevent the double-text/messy overlap
        btn.removeAttribute("title"); 
        
        btn.style.top=d.top; 
        btn.style.left=d.left;
        btn.style.display=d.floor===currentFloor?"block":"none";
        
        btn.onclick=()=>{
            if(!roomCode) return;
            const newOpened = !btn.classList.contains("opened");
            optimisticToggleUI(d.id, newOpened);
            db.ref(`rooms/${roomCode}/doors/${d.id}`).set({ 
                opened: newOpened, 
                by: userUID, 
                at: Date.now() 
            })
            .then(() => {
                logHistory({type:"door", by:userUID, text:`${newOpened?"opened":"closed"} ${d.label}`});
            })
            .catch(e => {
                console.error("Write failed:", e);
                optimisticToggleUI(d.id, !newOpened, true);
            });
        };
        container.appendChild(btn);
    });
}

function renderDoorList(){
    if(!roomCode) return;
    const list = document.getElementById("door-list");
    const text = document.getElementById("door-progress-text");
    const bar = document.getElementById("door-progress-bar");
    list.innerHTML=""; let openedCount=0;
    
    const sortedDoors=[...DOORS].sort((a,b)=>b.floor-a.floor);
    
    sortedDoors.forEach(door=>{
        const state=doorsState[door.id]; 
        if(!state) return;
        
        if(state.opened) openedCount++;
        
        const li=document.createElement("li");
        li.classList.add(state.opened?"door-opened":"door-closed");
        li.setAttribute("data-door-id", door.id);
        
        const user = usersCache[state.by];
        const name = user?.name||"Unknown";
        const color = user?.color||"#fff";
        const openedAt = state.at ? new Date(state.at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "";
        
        li.innerHTML=`<div class="door-title">${door.label} (${door.floor===2?"2F":"1F"})</div>
            ${state.opened?`<div class="door-meta">opened by <span style="color:${color}; font-weight:bold;">${name}</span><span class="door-time">${openedAt}</span></div>`:""}`;
        
        li.onclick=()=>{ 
            const newState=!state.opened;
            
            // 1. Optimistic Update
            optimisticToggleUI(door.id, newState);

            // 2. Database Write
            db.ref(`rooms/${roomCode}/doors/${door.id}`).set({ 
                opened:newState, 
                by:userUID, 
                at:Date.now() 
            })
            .then(() => {
                // 3. Log History ONLY on success
                logHistory({type:"door", by:userUID, text:`${newState?"opened":"closed"} ${door.label}`});
            })
            .catch(e => {
                // 4. Rollback UI on failure
                console.error("Permission denied for checklist update: ", e);
                optimisticToggleUI(door.id, !newState, true);
                alert("Action failed. Check console for details.");
            });
        };
        list.appendChild(li);
    });
    
    const total=DOORS.length;
    const percent=total?Math.round((openedCount/total)*100):0;
    text.innerText=`${openedCount} / ${total} opened`;
    bar.style.width=percent+"%";
}

function switchFloor(floor){
  currentFloor=floor;
  document.getElementById("map-image").src=floor===1?"floor1.png":"floor2.png";
  document.querySelectorAll(".floor-btn").forEach(btn=>btn.classList.remove("active"));
  document.querySelector(`.floor-btn[data-floor='${floor}']`).classList.add("active");
  document.querySelectorAll(".door-icon").forEach(btn=>{
    const doorId = btn.getAttribute("data-door-id");
    const door = DOORS.find(d => d.id === doorId); 
    btn.style.display = door && door.floor===floor?"block":"none";
  });
}

document.getElementById("reset-btn").addEventListener("click", resetDoors);
document.getElementById("delete-btn").addEventListener("click", deleteRoom);
document.getElementById("leave-btn").addEventListener("click", leaveRoom);

function resetDoors(){
  if(!roomCode) return;
  const resetState={}; 
  DOORS.forEach(d => resetState[d.id] = { opened: false, by: userUID, at: Date.now() });
  
  db.ref(`rooms/${roomCode}`).update({ 
      doors: resetState, 
      lastAction: { type: "reset", by: userUID, at: Date.now() } 
  });
  logHistory({ type: "reset", by: userUID, text: "reset all doors" });
}

function deleteRoom(){
  if(!roomCode || !confirm("Are you sure you want to delete the room? This cannot be undone.")) return;
  const historyRef = db.ref(`rooms/${roomCode}/history`);
  historyRef.push({
      type: "delete", 
      by: userUID, 
      text: "deleted the room", 
      at: Date.now()
  }).then(() => {
      return db.ref(`rooms/${roomCode}`).remove();
  }).catch(err => {
      console.error("Deletion failed:", err);
      alert("You could not delete the room. Are you still a member?");
  });
}

function leaveRoom(){
  if(!roomCode) return;
  const userRef = db.ref(`rooms/${roomCode}/users/${userUID}`);
  userRef.onDisconnect().cancel(); 
  userRef.remove();
  
  cleanupRoomState();
  showNotification(`You left the room.`);
}

function cleanupRoomState(){
  if(timerInterval) clearInterval(timerInterval);
  if(roomCode){
    db.ref(`rooms/${roomCode}`).off();
    db.ref(`rooms/${roomCode}/doors`).off();
    db.ref(`rooms/${roomCode}/users`).off();
    db.ref(`rooms/${roomCode}/history`).off();
  }
  document.querySelector(".map-container").classList.add("hidden");
  document.getElementById("floor-buttons").classList.add("hidden");
  document.getElementById("room-info").classList.add("hidden");
  document.getElementById("users-list").classList.add("hidden");
  document.getElementById("door-card").classList.add("hidden");
  document.getElementById("history-card").classList.add("hidden");
  document.getElementById("color-selector").classList.add("hidden");
  document.getElementById("history-list").innerHTML="";
  document.getElementById("input-row").classList.remove("hidden");
  document.querySelectorAll(".door-icon").forEach(btn=>btn.remove());
  document.getElementById("room-code").innerText="";
  document.getElementById("room-timer").innerText="--:--";
  document.getElementById("users-list").innerHTML="";
  setLobbyLocked(false);
  roomCode=null; doorsState={}; usersCache={};
}

function logHistory(entry){
  if(!roomCode) return;
  db.ref(`rooms/${roomCode}/history`).push({...entry, at:Date.now()});
}

function checkStaleRooms(user = firebase.auth().currentUser, customMessage = "Starting stale room cleanup...") {
    if (!user) {
        user = firebase.auth().currentUser;
        if (!user) return;
    }
    console.log(customMessage); 
    if (TRUSTED_UIDS.includes(user.uid)) {
        console.log("Trusted ID Authorized"); 
        const roomsRef = db.ref("rooms");
        const now = Date.now();
        const batchUpdates = {};
        let roomsDeleted = 0;
        roomsRef.once("value").then(snapshot => {
            snapshot.forEach(roomSnapshot => {
                const roomId = roomSnapshot.key;
                const roomData = roomSnapshot.val();
                if (!roomData) return; 
                const isExpired = roomData.expiresAt && roomData.expiresAt < now;
                const isEmpty = !roomData.users || Object.keys(roomData.users).length === 0;
                const OLD_MS = 600000; 
                const isOldAndEmpty = isEmpty && (roomData.createdAt < (now - OLD_MS)); 
                if (isExpired || isOldAndEmpty) {
                    batchUpdates[roomId] = null; 
                    roomsDeleted++;
                }
            });
            if (roomsDeleted > 0) {
                return roomsRef.update(batchUpdates).then(() => {
                    console.log(`Finished cleanup. Deleted ${roomsDeleted} stale rooms.`);
                });
            } else {
                console.log("Finished cleanup. No stale rooms found.");
            }
        }).catch(err => {
            console.error("Client-side cleanup failed:", err);
        });
    } else {
        console.log("User is not a Trusted ID. Skipping room cleanup attempt."); 
    }
}

function showNotification(html){
  const container=document.getElementById("notifications-container");
  const notif=document.createElement("div");
  notif.innerHTML=html;
  notif.style.background="#2d6cd2"; notif.style.color="white"; notif.style.padding="10px 15px"; notif.style.borderRadius="6px"; notif.style.fontSize="14px"; notif.style.opacity="0.9"; notif.style.marginTop="5px"; notif.style.transition="opacity 0.5s";
  container.appendChild(notif);
  setTimeout(()=>{ notif.style.opacity="0"; setTimeout(()=>container.removeChild(notif),500); },3000);
}

function checkBanStatus() {
    if (!userUID) { setLobbyLocked(true); return; }
    db.ref(`bannedUsers/${userUID}`).once("value").then(snap => {
        if (snap.exists()) {
            isUserBanned = true;
            alert("You have been banned from using this service.");
            setLobbyLocked(true); 
        } else {
            isUserBanned = false;
            setLobbyLocked(false);
        }
    }).catch(err => {
        console.error("Failed to check ban status:", err);
        alert("A temporary error occurred during service check. Please try again.");
        setLobbyLocked(true); 
    });
}
