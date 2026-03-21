import { db } from './firebase.js';
import { ref, set, push, onValue, get, query, limitToLast, remove, onDisconnect, update, off } from "firebase/database";

document.addEventListener('DOMContentLoaded', () => {
    const btnCreate = document.getElementById('btnCreate');
    const btnLeave = document.getElementById('btnLeave');
    const btnSend = document.getElementById('btnSend');
    const chatInput = document.getElementById('chatInput');
    const usernameInput = document.getElementById('username');
    const searchRoomInput = document.getElementById('searchRoomInput');
    const roomListArea = document.getElementById('roomListArea');
    const playerList = document.getElementById('playerList');
    const lobbyDiv = document.getElementById('lobby');
    const gameRoomDiv = document.getElementById('gameRoom');
    const roomIdText = document.getElementById('roomIdText');
    const playerCountLabel = document.getElementById('playerCountLabel');
    const avatarList = document.getElementById('avatarList');
    const btnStart = document.getElementById('btnStart');

    const myId = "p_" + Math.random().toString(36).substr(2, 9);
    let currentRoomId = null;
    let allRooms = {};

    // --- Avatar (ย้ายมาใช้แบบ Dynamic ในห้อง) ---
    const avatars = ["🐱", "🐶", "🦊", "🦁", "🐸", "🐵", "🦄", "🐼", "🐙", "👻", "🐯", "🐨", "🐰", "🐹", "👽", "🤖"];
    
    document.getElementById('nextAv').onclick = () => avatarList.scrollBy({ left: 100, behavior: 'smooth' });
    document.getElementById('prevAv').onclick = () => avatarList.scrollBy({ left: -100, behavior: 'smooth' });

    // ฟังก์ชันช่วยหา Avatar ที่ยังไม่มีใครใช้
    const getFreeAvatar = (roomPlayers) => {
        const usedAvatars = Object.values(roomPlayers || {}).map(p => p.avatar);
        return avatars.find(a => !usedAvatars.includes(a)) || avatars[0];
    };

    // --- Host Controls ---
    window.kickPlayer = async (targetId) => {
        if (!currentRoomId || !confirm("เตะผู้เล่นคนนี้ออกใช่ไหม?")) return;
        await remove(ref(db, `rooms/${currentRoomId}/players/${targetId}`));
    };

    window.transferHost = async (targetId) => {
        if (!currentRoomId || !confirm("โอนตำแหน่งหัวหน้าห้องให้คนนี้ใช่ไหม?")) return;
        const updates = {};
        updates[`/rooms/${currentRoomId}/hostId`] = targetId;
        updates[`/rooms/${currentRoomId}/players/${myId}/isHost`] = false;
        updates[`/rooms/${currentRoomId}/players/${targetId}/isHost`] = true;
        await update(ref(db), updates);
    };

    // --- Lobby Rooms ---
    function renderRooms(filterText = "") {
        roomListArea.innerHTML = "";
        const filteredKeys = Object.keys(allRooms).filter(rId => 
            rId.substring(0, 6).toUpperCase().includes(filterText.toUpperCase())
        );

        if (filteredKeys.length === 0) {
            roomListArea.innerHTML = `
                <div class="empty-rooms">
                    <span class="icon">${filterText ? '🔍' : '🏜️'}</span>
                    <p>${filterText ? 'ไม่พบห้องที่ค้นหา' : 'ไม่มีห้องว่างในขณะนี้'}</p>
                </div>`;
            return;
        }

        filteredKeys.forEach(rId => {
            const room = allRooms[rId];
            if (!room.players) return;
            const pCount = Object.keys(room.players).length;
            const isPlaying = room.status === "playing";
            const item = document.createElement('div');
            item.className = 'room-item';
            
            let btnHtml = '';
            if (isPlaying) {
                btnHtml = `<button disabled style="width:85px; height:40px; background:var(--muted); border-radius:12px; color:white; font-size:0.9rem; border:none; font-weight:600; cursor:not-allowed;">กำลังเล่น</button>`;
            } else {
                btnHtml = `<button onclick="window.directJoin('${rId}')" style="width:70px; height:40px; background:var(--secondary); border-radius:12px; color:white; font-size:0.9rem; border:none; font-weight:600; cursor:pointer;">เข้า</button>`;
            }

            item.innerHTML = `
                <div style="flex:1;">
                    <span style="font-weight:600; font-size:1rem; color:var(--primary);">🏠 ${rId.substring(0,6).toUpperCase()}</span>
                    <br><span style="font-size:0.75rem; color:#94a3b8;">สมาชิกในห้อง ${pCount}/10 คน</span>
                </div>
                ${btnHtml}
            `;
            roomListArea.appendChild(item);
        });
    }

    onValue(query(ref(db, 'rooms'), limitToLast(20)), (snapshot) => {
        allRooms = snapshot.val() || {};
        
        Object.keys(allRooms).forEach(rId => {
            if (!allRooms[rId].players) {
                remove(ref(db, `rooms/${rId}`));
                delete allRooms[rId];
            }
        });

        renderRooms(searchRoomInput.value);
    });

    searchRoomInput.oninput = (e) => renderRooms(e.target.value);

    // --- Main Logic ---
    async function leaveRoom() {
        if (!currentRoomId) return;
        
        const roomIdToLeave = currentRoomId; 
        currentRoomId = null;

        off(ref(db, `rooms/${roomIdToLeave}`));
        
        onDisconnect(ref(db, `rooms/${roomIdToLeave}`)).cancel();
        onDisconnect(ref(db, `rooms/${roomIdToLeave}/players/${myId}`)).cancel();

        await remove(ref(db, `rooms/${roomIdToLeave}/players/${myId}`));
        
        const snap = await get(ref(db, `rooms/${roomIdToLeave}/players`));
        if (!snap.exists()) {
            await remove(ref(db, `rooms/${roomIdToLeave}`));
        }
        
        playerList.innerHTML = "";
        gameRoomDiv.style.display = 'none';
        lobbyDiv.style.display = 'flex';
    }
    btnLeave.onclick = leaveRoom;

    async function sendMessage() {
        const msg = chatInput.value.trim();
        if (!msg || !currentRoomId) return;
        const myMsgRef = ref(db, `rooms/${currentRoomId}/players/${myId}/lastMsg`);
        await set(myMsgRef, msg);
        chatInput.value = "";
        setTimeout(async () => {
            const snap = await get(myMsgRef);
            if (snap.val() === msg) await set(myMsgRef, null);
        }, 5000);
    }
    btnSend.onclick = sendMessage;
    chatInput.onkeypress = (e) => { if(e.key === 'Enter') sendMessage(); };

    window.directJoin = async (roomId) => {
        const name = usernameInput.value.trim();
        if (!name) return alert("❌ โปรดตั้งชื่อก่อน!");
        const roomSnap = await get(ref(db, `rooms/${roomId}`));
        if (!roomSnap.exists()) return alert("❌ ห้องนี้ปิดไปแล้ว!");
        
        const roomData = roomSnap.val();
        if (roomData.status === "playing") return alert("❌ ห้องนี้กำลังเล่นเกมอยู่!");
        if (Object.keys(roomData.players || {}).length >= 10) return alert("❌ ห้องเต็มแล้ว!");

        const freeAvatar = getFreeAvatar(roomData.players);
        
        onDisconnect(ref(db, `rooms/${roomId}/players/${myId}`)).remove();
        
        await set(ref(db, `rooms/${roomId}/players/${myId}`), { name, avatar: freeAvatar, isHost: false, lastMsg: null });
        currentRoomId = roomId;
        showRoom(roomId);
    };

    btnCreate.onclick = async () => {
        const name = usernameInput.value.trim();
        if (!name) return alert("❌ โปรดตั้งชื่อก่อน!");
        const newRoomRef = push(ref(db, 'rooms'));
        const roomId = newRoomRef.key;
        
        onDisconnect(ref(db, `rooms/${roomId}`)).remove(); 
        
        await set(newRoomRef, { hostId: myId, status: "waiting", players: { [myId]: { name, avatar: avatars[0], isHost: true, lastMsg: null } } });
        currentRoomId = roomId;
        showRoom(roomId);
    };

    function showRoom(id) {
        lobbyDiv.style.display = 'none';
        gameRoomDiv.style.display = 'flex';
        roomIdText.innerText = `ROOM: ${id.substring(0,6).toUpperCase()}`;

        let lastDisconnectMode = null;

        onValue(ref(db, `rooms/${id}`), async (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData || !roomData.players || !roomData.players[myId]) {
                if (currentRoomId) leaveRoom();
                return;
            }
            const players = roomData.players;
            const pIds = Object.keys(players);
            const amIHost = (roomData.hostId === myId);

            // --- ระบบสลับ onDisconnect อัตโนมัติ ---
            if (pIds.length === 1 && pIds[0] === myId) {
                if (lastDisconnectMode !== 'room') {
                    onDisconnect(ref(db, `rooms/${id}/players/${myId}`)).cancel();
                    onDisconnect(ref(db, `rooms/${id}`)).remove();
                    lastDisconnectMode = 'room';
                }
            } else {
                if (lastDisconnectMode !== 'player') {
                    onDisconnect(ref(db, `rooms/${id}`)).cancel();
                    onDisconnect(ref(db, `rooms/${id}/players/${myId}`)).remove();
                    lastDisconnectMode = 'player';
                }
            }

            if (!players[roomData.hostId]) {
                const newHostId = pIds[0];
                if (myId === newHostId) {
                    const updates = {};
                    updates[`/rooms/${id}/hostId`] = newHostId;
                    updates[`/rooms/${id}/players/${newHostId}/isHost`] = true;
                    update(ref(db), updates);
                }
                return;
            }

            // --- อัปเดตรายชื่ออวาตาร์ (ล็อคถ้าซ้ำ) ---
            const takenAvatars = {};
            pIds.forEach(pId => {
                takenAvatars[players[pId].avatar] = pId;
            });

            avatarList.innerHTML = "";
            avatars.forEach(av => {
                const el = document.createElement('div');
                el.className = 'avatar-item';
                el.innerText = av;

                if (takenAvatars[av]) {
                    if (takenAvatars[av] === myId) {
                        el.classList.add('selected'); // เป็นของเรา
                    } else {
                        el.classList.add('disabled'); // เป็นของคนอื่น
                    }
                }

                el.onclick = async () => {
                    // ถ้าถูกคนอื่นเลือกไปแล้วไม่ให้กด
                    if (takenAvatars[av] && takenAvatars[av] !== myId) return;
                    // ถ้าเป็นตัวเดิมของเราอยู่แล้ว ไม่ต้องอัปเดตให้เปลืองโควตา
                    if (takenAvatars[av] === myId) return;
                    
                    // อัปเดตตัวละครใหม่ไปที่ Firebase
                    await update(ref(db, `rooms/${id}/players/${myId}`), { avatar: av });
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                };
                
                avatarList.appendChild(el);
            });

            // --- อัปเดตรายชื่อผู้เล่น ---
            playerCountLabel.innerText = pIds.length;
            playerList.innerHTML = ""; 

            pIds.forEach(pId => {
                const p = players[pId];
                const div = document.createElement('div');
                div.className = `player-card ${pId === myId ? 'is-me' : ''}`;
                let controlsHtml = "";
                if (amIHost && pId !== myId) {
                    controlsHtml = `
                        <div class="host-controls">
                            <button class="btn-transfer" title="มอบหัวหน้า" onclick="window.transferHost('${pId}')">👑</button>
                            <button class="btn-kick" title="เตะ" onclick="window.kickPlayer('${pId}')">🚫</button>
                        </div>`;
                }
                div.innerHTML = `
                    <div class="player-icon">${p.isHost ? '<span class="host-crown">👑</span>' : ''}<span>${p.avatar || '👤'}</span></div>
                    <div class="player-name">${p.name} ${pId === myId ? '<span class="me-badge">YOU</span>' : ''}</div>
                    ${controlsHtml}
                    ${p.lastMsg ? `<div class="chat-bubble">${p.lastMsg}</div>` : ''}
                `;
                playerList.appendChild(div);
            });
            
            // --- อัปเดตปุ่มเริ่มเกมตามสถานะห้อง ---
            if (amIHost) {
                btnStart.style.display = 'block';
                if (roomData.status === "playing") {
                    btnStart.innerText = "🛑 จบเกม (กลับไปรอคน)";
                    btnStart.style.background = "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
                    btnStart.style.boxShadow = "0 4px 15px rgba(239, 68, 68, 0.4)";
                    btnStart.onclick = () => update(ref(db, `rooms/${id}`), { status: "waiting" });
                } else {
                    btnStart.innerText = "🔥 เริ่มเกมเลย!";
                    btnStart.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
                    btnStart.style.boxShadow = "0 4px 15px rgba(16, 185, 129, 0.4)";
                    btnStart.onclick = () => update(ref(db, `rooms/${id}`), { status: "playing" });
                }
            } else {
                btnStart.style.display = 'none';
            }
        });
    }
});