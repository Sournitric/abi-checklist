let username=null, userUID=null, roomCode=null, currentFloor=1, doorsState={}, usersCache={}, timerInterval=null, roomExpiresAt=0, userColor=null;
let isUserBanned = false;
let armoryInterval = null;
let activeMapConfig = null;
let activeDoorsList = []; 

const COLOR_MAP={green:"#2ecc71", blue:"#3498db", yellow:"#f1c40f", purple:"#9b59b6"};

const MAP_LIBRARY = {
  "tv_station": {
    name: "TV Station",
    floors: [
      { id: 1, name: "Floor 1", img: "images/tvstation/floor1.png" },
      { id: 2, name: "Floor 2", img: "images/tvstation/floor2.png" }
    ],
    doors: [
      { id: "2f_general_office", label: "General Office", floor: 2, top: "71.8834%", left: "30.855%" },
      { id: "darkroom", label: "Darkroom", floor: 1, top: "77.2353%", left: "74.697%" },
      { id: "infirmary", label: "Infirmary", floor: 1, top: "57.7608%", left: "35.7576%" },
      { id: "2f_directors_office", label: "Director's Office", floor: 2, top: "86.5%", left: "56%" },
      { id: "post_production", label: "Post-Production Room", floor: 1, top: "44.8936%", left: "71.9697%" },
      { id: "editing_room", label: "Editing Room", floor: 2, top: "5.17527%", left: "26.5909%" },
      { id: "planning_room", label: "Planning Room", floor: 1, top: "38.8046%", left: "43.2955%" }
    ] 
  },
  
  "Armory": {
    name: "Armory",
    floors: [
       { id: 1, name: "Outer Wall", img: "images/armory/outerwall.png" },
       { id: 2, name: "Floor 2", img: "images/armory/floor2.png" },
       { id: 3, name: "Floor 1", img: "images/armory/floor1.png"},
       { id: 4, name: "Basement", img: "images/armory/basement.png"}
    ],
    doors: [
       { id: "sluice_2", label: "Sluice No.2", floor: 1, top: "32%", left: "45%" },
       { id: "weapon_storage", label: "Weapon Storage", floor: 2, top:"69%", left:"49%"},
       { id: "2f_lounge", label: "Second Floor Lounge", floor: 2, top:"54%", left:"66%"},
       { id: "private_lounge", label: "Private Lounge", floor: 3, top:"61.5%", left: "75%" },
       { id: "command_room", label: "Command Room", floor: 4, top:"53.8%", left:"40.9%"}
    ]
  }
};


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

/* --- UI HELPERS --- */
function isUsernameValid(str) {
    const maxLength = 20; 
    const uidToCheck = userUID;
    if (str.length > maxLength) return false;
    if (uidToCheck && TRUSTED_USERNAMES_UIDS.includes(uidToCheck)) {
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
    popup.innerText = "Copied!"; 
    btn.parentNode.appendChild(popup);
    popup.style.left = (btn.offsetLeft + (btn.offsetWidth / 2) - 20) + "px";
    popup.style.top = (btn.offsetTop - 15) + "px";
    setTimeout(() => popup.remove(), 2000);
  });
}

// --- MAP SELECTION LOGIC ---
document.getElementById("createBtn").addEventListener("click", showMapModal);
document.getElementById("joinBtn").addEventListener("click", joinRoomInput);
document.getElementById("copy-room-btn").addEventListener("click", copyRoomCode);

document.getElementById("cancel-map-btn").addEventListener("click", () => {
    document.getElementById("map-modal").classList.add("hidden");
});

document.getElementById("confirm-map-btn").addEventListener("click", () => {
    const selectedMapId = document.getElementById("map-select-dropdown").value;
    startRoomCreation(selectedMapId);
});

function showMapModal() {
    if (isUserBanned) { alert("Action denied: You are banned."); return; }
    if (roomCode) { alert("Leave current room first."); return; }
    
    username = document.getElementById("username").value.trim();
    if (!isUsernameValid(username)) { 
        alert("Username must be 3-20 characters long and cannot contain unusual symbols.");
        return;
    }

    // Populate Dropdown
    const dropdown = document.getElementById("map-select-dropdown");
    dropdown.innerHTML = "";

    // Define your desired order here using the IDs from MAP_LIBRARY
    const preferredOrder = ["tv_station", "Armory"];

    preferredOrder.forEach(key => {
        if (MAP_LIBRARY[key]) {
            const option = document.createElement("option");
            option.value = key;
            option.text = MAP_LIBRARY[key].name;
            dropdown.appendChild(option);
        }
    });

    // Add any maps that might not be in the preferredOrder list at the end
    Object.keys(MAP_LIBRARY).forEach(key => {
        if (!preferredOrder.includes(key)) {
            const option = document.createElement("option");
            option.value = key;
            option.text = MAP_LIBRARY[key].name;
            dropdown.appendChild(option);
        }
    });

    document.getElementById("map-modal").classList.remove("hidden");
}

function startRoomCreation(mapId) {
    document.getElementById("map-modal").classList.add("hidden");
    checkStaleRooms(firebase.auth().currentUser, "Checking stale rooms before create...");
    
    roomCode = Math.random().toString(36).substring(2,7).toUpperCase();
    
    // Load config for selected map
    const mapConfig = MAP_LIBRARY[mapId];
    if (!mapConfig) { alert("Invalid map selected"); return; }
    
    const doors = {};
    mapConfig.doors.forEach(d => doors[d.id] = { opened:false, by: userUID, at: Date.now() });

    const initialUser = {};
    initialUser[userUID] = {
        name: username,
        color: userColor || COLOR_MAP.green,
        joinedAt: Date.now()
    };

    const roomData = { 
        createdAt: Date.now(), 
        expiresAt: Date.now() + 4*60*60*1000, 
        mapId: mapId, // SAVE THE MAP ID
        doors: doors,
        users: initialUser 
    };
  
    db.ref("rooms/" + roomCode).set(roomData)
        .then(() => joinRoom(roomCode))
        .catch(err => { 
            console.error(err); 
            alert("Failed to create room."); 
            roomCode = null;
        });
}

function joinRoomInput() {
    if (isUserBanned) { alert("Action denied: You are banned."); return; }
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

function loadMapConfiguration(mapId) {
    if (!MAP_LIBRARY[mapId]) {
        alert("Error: This room is using an unknown map.");
        return false;
    }
    activeMapConfig = MAP_LIBRARY[mapId];
    activeDoorsList = activeMapConfig.doors;
    
    // Toggle the Armory-specific layout class
    if (mapId === "Armory") {
        document.body.classList.add("armory-active");
    } else {
        document.body.classList.remove("armory-active");
    }
    
    // Set map name in UI
    document.getElementById("current-map-name").innerText = activeMapConfig.name;

    // Generate Floor Buttons
    const btnContainer = document.getElementById("floor-buttons");
    btnContainer.innerHTML = "";
    
    activeMapConfig.floors.forEach((f, index) => {
        const btn = document.createElement("button");
        btn.classList.add("floor-btn");
        if (index === 0) btn.classList.add("active");
        btn.innerText = f.name;
        btn.setAttribute("data-floor-id", f.id);
        
        btn.addEventListener("click", () => switchFloor(f.id));
        btnContainer.appendChild(btn);
    });

    currentFloor = activeMapConfig.floors[0].id;
    switchFloor(currentFloor);

    return true;
}

function joinRoom(code) {
  const roomRef = db.ref("rooms/" + code);
  roomRef.once("value").then(roomSnap => {
    if (!roomSnap.exists()) { alert("Room not found"); return; }
    const room = roomSnap.val();
    if (Date.now() > room.expiresAt) { alert("Room expired"); return; }

    const mapId = room.mapId || "tv_station";
    if (!loadMapConfiguration(mapId)) return;

    const usersRef = db.ref(`rooms/${code}/users`);
    usersRef.once("value").then(snap => {
      const users = snap.val() || {};
      if (Object.entries(users).some(([uid, u]) => uid !== userUID && u.name === username)) {
        alert("Name taken");
        return;
      }
      const userRef = db.ref(`rooms/${code}/users/${userUID}`);
      if (!userColor) userColor = COLOR_MAP.green;
      userRef.onDisconnect().remove();
      userRef.set({ name: username, color: userColor, joinedAt: Date.now() });
      roomCode = code;

      document.getElementById("room-code").innerText = code;
      document.getElementById("room-info").classList.remove("hidden");
      document.getElementById("users-list").classList.remove("hidden");
      document.querySelector(".map-container").classList.remove("hidden");
      document.getElementById("floor-buttons").classList.remove("hidden");
      document.getElementById("door-card").classList.remove("hidden");
      document.getElementById("history-card").classList.remove("hidden");
      document.getElementById("color-selector").classList.remove("hidden");
      document.getElementById("input-row").classList.add("hidden");

      // --- Armory Status Logic ---
      const armoryCard = document.getElementById("armory-status-card");
      if (mapId === "Armory") {
        armoryCard.classList.remove("hidden");
        const armoryRef = db.ref(`rooms/${code}/armory_status`);

  armoryRef.on("value", armorySnap => {
    const status = armorySnap.val() || {};
    if (armoryInterval) clearInterval(armoryInterval);

    const updateTick = () => {
        document.querySelectorAll(".armory-item").forEach(item => {
            const id = item.getAttribute("data-id");
            const data = status[id];
            const timerText = item.querySelector(".armory-timer-text");

            if (data && data.active) {
                item.classList.add("active-lever");
                const elapsedTotal = Math.floor((Date.now() - data.at) / 1000);
                
                // Format seconds into minutes and seconds
                const mins = Math.floor(elapsedTotal / 60);
                const secs = elapsedTotal % 60;
                const timeString = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

                const user = usersCache[data.by] || { name: "Unknown", color: "#fff" };
                
                // (OPEN) text removed here
                timerText.innerHTML = `<span style="color:${user.color}">${user.name}</span> pulled ${timeString} ago`;
            } else {
                item.classList.remove("active-lever");
                timerText.innerText = "Ready";
            }
        });
    };
    updateTick();
    armoryInterval = setInterval(updateTick, 1000);
});

document.querySelectorAll(".armory-item").forEach(item => {
    item.onclick = () => {
        const id = item.getAttribute("data-id");
        const doorLabel = item.querySelector(".door-title").innerText;
        const currentlyActive = item.classList.contains("active-lever");
        
        db.ref(`rooms/${roomCode}/armory_status/${id}`).set({
            active: !currentlyActive,
            at: !currentlyActive ? Date.now() : null,
            by: !currentlyActive ? userUID : null
        });

        // UPDATED: "pulled the [Name] lever"
        logHistory({
            type: "armory",
            by: userUID,
            text: `${!currentlyActive ? "pulled" : "reset"} the ${doorLabel} lever`
        });
    };
});
      } else {
        armoryCard.classList.add("hidden");
      }

      // Existing user listing logic
      let previousUsers = {};
      usersRef.on("value", snap => {
        const users = snap.val() || {};
        Object.keys(previousUsers).forEach(uid => {
          if (!users[uid]) {
            const nameLeft = previousUsers[uid].name || "Unknown";
            showNotification(`<b>${nameLeft}</b> left the room`);
          }
        });
        previousUsers = { ...users };
        usersCache = users;
        const list = Object.values(users).map(u => `<span style="color:${u.color}; font-weight:bold;">${u.name}</span>`).join(", ");
        document.getElementById("users-list").innerHTML = "Users in room: " + (list || "None");
      });

      roomExpiresAt = room.expiresAt;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        const remaining = roomExpiresAt - Date.now();
        if (remaining <= 0) { document.getElementById("room-timer").innerText = "Expired"; leaveRoom(); return; }
        const tSec = Math.floor(remaining / 1000), h = Math.floor(tSec / 3600), m = Math.floor((tSec % 3600) / 60), s = tSec % 60;
        document.getElementById("room-timer").innerText = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }, 1000);

      roomRef.child("doors").once("value").then(snap => {
        doorsState = snap.val() || {};
        renderDoors();
        renderDoorList();

        roomRef.child("doors").on("child_changed", snap => {
          const doorId = snap.key, data = snap.val();
          doorsState[doorId] = data;
          renderDoors();
          renderDoorList();
          if (data.opened) {
            const userObj = usersCache?.[data.by];
            const name = userObj?.name || "Unknown";
            const color = userObj?.color || "#fff";
            const door = activeDoorsList.find(d => d.id === doorId);
            // UPDATED: Notification phrasing
            if (door) showNotification(`<span style="color:${color}; font-weight:bold;">${name}</span> pulled ${door.label} lever`);
          }
        });
      });

      roomRef.on("value", snap => {
        const data = snap.val();
        if (!snap.exists() || data?.deleting) {
          cleanupRoomState();
        }
      });

      roomRef.child("lastAction").on("value", snap => {
        const action = snap.val();
        if (!action || action.type !== "reset") return;
        const user = usersCache?.[action.by];
        const name = user?.name || "Someone";
        const color = user?.color || "#fff";
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

function renderDoors() {
  const container = document.querySelector(".map-container");
  if (!container || !roomCode || !activeMapConfig) return;

  document.querySelectorAll(".door-icon").forEach(el => el.remove());

  activeDoorsList.forEach(d => {
    const btn = document.createElement("button");
    btn.classList.add("door-icon");
    const state = doorsState[d.id] || { opened: false };
    if (state.opened) btn.classList.add("opened");

    btn.setAttribute("data-door-id", d.id);
    btn.setAttribute("data-label", d.label);
    btn.removeAttribute("title");

    btn.style.top = d.top;
    btn.style.left = d.left;
    btn.style.display = d.floor === currentFloor ? "block" : "none";

    btn.onclick = () => {
      if (!roomCode) return;
      const newOpened = !btn.classList.contains("opened");
      optimisticToggleUI(d.id, newOpened);
      db.ref(`rooms/${roomCode}/doors/${d.id}`).set({
        opened: newOpened,
        by: userUID,
        at: Date.now()
      })
.then(() => {
    const actionText = newOpened ? "pulled" : "reset";
    logHistory({ type: "door", by: userUID, text: `${actionText} the ${d.label} lever` });
})
        .catch(e => {
          console.error("Write failed:", e);
          optimisticToggleUI(d.id, !newOpened, true);
        });
    };
    container.appendChild(btn);
  });
}

function renderDoorList() {
  if (!roomCode || !activeMapConfig) return;
  const list = document.getElementById("door-list");
  const text = document.getElementById("door-progress-text");
  const bar = document.getElementById("door-progress-bar");
  list.innerHTML = "";
  let openedCount = 0;

  // --- SORTING LOGIC ---
  const sortedDoors = [...activeDoorsList].sort((a, b) => a.floor - b.floor);

  sortedDoors.forEach(door => {
    const state = doorsState[door.id];
    if (!state) return;

    if (state.opened) openedCount++;

    const li = document.createElement("li");
    li.classList.add(state.opened ? "door-opened" : "door-closed");
    li.setAttribute("data-door-id", door.id);

    const user = usersCache[state.by];
    const name = user?.name || "Unknown";
    const color = user?.color || "#fff";
    const openedAt = state.at ? new Date(state.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

    // Floor Label Logic
    const floorObj = activeMapConfig.floors.find(f => f.id === door.floor);
    const floorName = floorObj ? floorObj.name : "";

    let displayFloor = "";
    if (floorName === "Basement") {
      displayFloor = " (B1)";
    } else if (floorName === "Outer Wall") {
      displayFloor = "";
    } else if (floorName.includes("Floor")) {
      const num = floorName.replace(/[^0-9]/g, '');
      displayFloor = ` (${num}F)`;
    } else {
      displayFloor = floorName ? ` (${floorName})` : "";
    }

    li.innerHTML = `<div class="door-title">${door.label}${displayFloor}</div>
            ${state.opened ? `<div class="door-meta">pulled by <span style="color:${color}; font-weight:bold;">${name}</span><span class="door-time">${openedAt}</span></div>` : ""}`;

    li.onclick = () => {
      const newState = !state.opened;
      optimisticToggleUI(door.id, newState);
      db.ref(`rooms/${roomCode}/doors/${door.id}`).set({
        opened: newState,
        by: userUID,
        at: Date.now()
      })
.then(() => {
    const actionText = newState ? "pulled" : "reset";
    logHistory({ type: "door", by: userUID, text: `${actionText} the ${door.label} lever` });
})
        .catch(e => {
          console.error("Write failed:", e);
          optimisticToggleUI(door.id, !newState, true);
        });
    };
    list.appendChild(li);
  });

  const total = activeDoorsList.length;
  const percent = total ? Math.round((openedCount / total) * 100) : 0;
  text.innerText = `${openedCount} / ${total} pulled`; // Changed 'opened' to 'pulled'
  bar.style.width = percent + "%";

  // --- DYNAMIC POSITIONING FOR ARMORY ---
  const armoryCard = document.getElementById('armory-status-card');
  const doorCard = document.getElementById('door-card');

  if (document.body.classList.contains('armory-active') && armoryCard && doorCard) {
    requestAnimationFrame(() => {
      const doorCardHeight = doorCard.offsetHeight;
      const doorCardTop = 20;
      armoryCard.style.top = (doorCardTop + doorCardHeight + 15) + "px";
    });
  }
}

function switchFloor(floorId){
  if (!activeMapConfig) return;
  currentFloor = floorId;

  const floorConfig = activeMapConfig.floors.find(f => f.id === floorId);
  if (floorConfig) {
      document.getElementById("map-image").src = floorConfig.img;
  }

  document.querySelectorAll(".floor-btn").forEach(btn => btn.classList.remove("active"));
  const activeBtn = document.querySelector(`.floor-btn[data-floor-id='${floorId}']`);
  if (activeBtn) activeBtn.classList.add("active");

  document.querySelectorAll(".door-icon").forEach(btn=>{
    const doorId = btn.getAttribute("data-door-id");
    const door = activeDoorsList.find(d => d.id === doorId); 
    btn.style.display = door && door.floor===floorId?"block":"none";
  });
}

document.getElementById("reset-levers-btn").addEventListener("click", resetLevers);

document.getElementById("reset-btn").addEventListener("click", resetDoors);
document.getElementById("delete-btn").addEventListener("click", deleteRoom);
document.getElementById("leave-btn").addEventListener("click", leaveRoom);

function resetDoors(){
  if(!roomCode || !activeDoorsList) return;
  const resetState={}; 
  activeDoorsList.forEach(d => resetState[d.id] = { opened: false, by: userUID, at: Date.now() });
  
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
  if(armoryInterval) clearInterval(armoryInterval);
  
  if(roomCode){
    db.ref(`rooms/${roomCode}`).off();
    db.ref(`rooms/${roomCode}/doors`).off();
    db.ref(`rooms/${roomCode}/users`).off();
    db.ref(`rooms/${roomCode}/history`).off();
    db.ref(`rooms/${roomCode}/armory_status`).off();
  }
  document.querySelector(".map-container").classList.add("hidden");
  document.getElementById("floor-buttons").classList.add("hidden");
  document.getElementById("room-info").classList.add("hidden");
  document.getElementById("users-list").classList.add("hidden");
  document.getElementById("door-card").classList.add("hidden");
  document.getElementById("history-card").classList.add("hidden");
  document.getElementById("armory-status-card").classList.add("hidden");
  document.getElementById("color-selector").classList.add("hidden");
  document.getElementById("history-list").innerHTML="";
  document.getElementById("input-row").classList.remove("hidden");
  document.querySelectorAll(".door-icon").forEach(btn=>btn.remove());
  document.getElementById("room-code").innerText="";
  document.getElementById("room-timer").innerText="--:--";
  document.getElementById("users-list").innerHTML="";
  setLobbyLocked(false);
  
  roomCode=null; doorsState={}; usersCache={}; activeMapConfig=null; activeDoorsList=[];
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

function resetLevers() {
    if (!roomCode) return;
    
    const resetData = {};
    const items = document.querySelectorAll(".armory-item");
    if (items.length === 0) return;

    items.forEach(item => {
        const id = item.getAttribute("data-id");
        resetData[id] = { active: false, at: null, by: null };
    });

    db.ref(`rooms/${roomCode}/armory_status`).update(resetData)
    .then(() => {
        // Find the current user's name from your cache
        const currentUser = usersCache[userUID];
        const name = currentUser ? currentUser.name : "Someone";
        const color = currentUser ? currentUser.color : "#fff";

        logHistory({ 
            type: "armory", 
            by: userUID, 
            text: "reset all levers" 
        });

        // Updated Notification: "(User) reset all levers"
        showNotification(`<span style="color:${color}; font-weight:bold;">${name}</span> reset all levers`);
    })
    .catch(e => console.error("Reset levers failed:", e));
}
