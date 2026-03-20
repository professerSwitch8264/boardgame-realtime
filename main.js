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

    const myId = "p_" + Math.random().toString(36).substr(2, 9);
    let currentRoomId = null;
    let selectedAvatar = "🐱"; 
    let allRooms = {};

    // --- Avatar ---
    const avatars = ["🐱", "🐶", "🦊", "🦁", "🐸", "🐵", "🦄", "🐼", "🐙", "👻", "🐯", "🐨", "🐰", "🐹", "👽", "🤖"];
    avatars.forEach(av => {
        const el = document.createElement('div');
        el.className = 'avatar-item';
        el.innerText = av;
        if (av === selectedAvatar) el.classList.add('selected');
        el.onclick = () => {
            document.querySelectorAll('.avatar-item').forEach(item => item.classList.remove('selected'));
            el.classList.add('selected');
            selectedAvatar = av;
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        };
        avatarList.appendChild(el);
    });

    document.getElementById('nextAv').onclick = () => avatarList.scrollBy({ left: 100, behavior: 'smooth' });
    document.getElementById('prevAv').onclick = () => avatarList.scrollBy({ left: -100, behavior: 'smooth' });

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
            const item = document.createElement('div');
            item.className = 'room-item';
            item.innerHTML = `
                <div style="flex:1;">
                    <span style="font-weight:600; font-size:1rem; color:var(--primary);">🏠 ${rId.substring(0,6).toUpperCase()}</span>
                    <br><span style="font-size:0.75rem; color:#94a3b8;">สมาชิกในห้อง ${pCount}/10 คน</span>
                </div>
                <button onclick="window.directJoin('${rId}')" style="width:70px; height:40px; background:var(--secondary); border-radius:12px; color:white; font-size:0.9rem; border:none; font-weight:600; cursor:pointer;">เข้า</button>
            `;
            roomListArea.appendChild(item);
        });
    }

    onValue(query(ref(db, 'rooms'), limitToLast(20)), (snapshot) => {
        allRooms = snapshot.val() || {};
        renderRooms(searchRoomInput.value);
    });

    searchRoomInput.oninput = (e) => renderRooms(e.target.value);

    // --- Main Logic ---
    async function leaveRoom() {
        if (!currentRoomId) return;
        off(ref(db, `rooms/${currentRoomId}`));
        await remove(ref(db, `rooms/${currentRoomId}/players/${myId}`));
        const snap = await get(ref(db, `rooms/${currentRoomId}/players`));
        if (!snap.exists()) await remove(ref(db, `rooms/${currentRoomId}`));
        currentRoomId = null;
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
        onDisconnect(ref(db, `rooms/${roomId}/players/${myId}`)).remove();
        await set(ref(db, `rooms/${roomId}/players/${myId}`), { name, avatar: selectedAvatar, isHost: false, lastMsg: null });
        currentRoomId = roomId;
        showRoom(roomId);
    };

    btnCreate.onclick = async () => {
        const name = usernameInput.value.trim();
        if (!name) return alert("❌ โปรดตั้งชื่อก่อน!");
        const newRoomRef = push(ref(db, 'rooms'));
        const roomId = newRoomRef.key;
        onDisconnect(ref(db, `rooms/${roomId}/players/${myId}`)).remove();
        await set(newRoomRef, { hostId: myId, players: { [myId]: { name, avatar: selectedAvatar, isHost: true, lastMsg: null } } });
        currentRoomId = roomId;
        showRoom(roomId);
    };

    function showRoom(id) {
        lobbyDiv.style.display = 'none';
        gameRoomDiv.style.display = 'flex';
        roomIdText.innerText = `ROOM: ${id.substring(0,6).toUpperCase()}`;

        onValue(ref(db, `rooms/${id}`), async (snapshot) => {
            const roomData = snapshot.val();
            if (!roomData || !roomData.players || !roomData.players[myId]) {
                if (currentRoomId) leaveRoom();
                return;
            }
            const players = roomData.players;
            const pIds = Object.keys(players);
            const amIHost = (roomData.hostId === myId);

            if (!players[roomData.hostId]) {
                const newHostId = pIds[0];
                const updates = {};
                updates[`/rooms/${id}/hostId`] = newHostId;
                updates[`/rooms/${id}/players/${newHostId}/isHost`] = true;
                await update(ref(db), updates);
                return;
            }

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
            document.getElementById('btnStart').style.display = amIHost ? 'block' : 'none';
        });
    }
});