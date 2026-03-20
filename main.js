// main.js
import { db } from './firebase.js';
import { ref, set, push, onValue, get, query, limitToLast, remove, onDisconnect, update } from "firebase/database";

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const btnCreate = document.getElementById('btnCreate');
    const btnJoin = document.getElementById('btnJoin');
    const btnLeave = document.getElementById('btnLeave');
    const usernameInput = document.getElementById('username');
    const roomInput = document.getElementById('roomInput');
    const roomListArea = document.getElementById('roomListArea');
    const playerList = document.getElementById('playerList');
    const lobbyDiv = document.getElementById('lobby');
    const gameRoomDiv = document.getElementById('gameRoom');
    const roomIdText = document.getElementById('roomIdText');
    const playerCountLabel = document.getElementById('playerCountLabel');

    const myId = "p_" + Math.random().toString(36).substr(2, 9);
    let currentRoomId = null;

    // --- 1. แสดงรายการห้องล่าสุด ---
    onValue(query(ref(db, 'rooms'), limitToLast(10)), (snapshot) => {
        const rooms = snapshot.val();
        roomListArea.innerHTML = "";
        if (!rooms) return roomListArea.innerHTML = "ไม่มีห้องว่าง";
        
        Object.keys(rooms).forEach(rId => {
            const room = rooms[rId];
            if (!room.players) return; // ไม่โชว์ห้องที่ไม่มีคน (เศษข้อมูล)
            const pCount = Object.keys(room.players).length;
            const item = document.createElement('div');
            item.className = 'room-item';
            item.innerHTML = `
                <span>ID: ${rId.substring(0,6)} (${pCount}/10)</span>
                <button onclick="window.directJoin('${rId}')" style="width:auto; padding:5px 10px; background:#4caf50; color:white;">Join</button>
            `;
            roomListArea.appendChild(item);
        });
    });

    // --- 2. ฟังก์ชันออกจากห้อง (Cleanup) ---
    async function leaveRoom() {
        if (!currentRoomId) return;
        
        const roomPath = `rooms/${currentRoomId}`;
        const playersRef = ref(db, `${roomPath}/players`);
        
        // ลบตัวเองออกก่อน
        await remove(ref(db, `${roomPath}/players/${myId}`));
        
        // เช็คว่าหลังจากเราออก มีคนเหลือไหม
        const snap = await get(playersRef);
        if (!snap.exists()) {
            // ถ้าไม่มีคนเหลือแล้ว ให้ลบห้องทิ้งทันที
            await remove(ref(db, roomPath));
        }

        currentRoomId = null;
        gameRoomDiv.style.display = 'none';
        lobbyDiv.style.display = 'block';
    }
    btnLeave.onclick = leaveRoom;

    // --- 3. ฟังก์ชันจอยห้อง ---
    window.directJoin = async (roomId) => {
        const name = usernameInput.value.trim();
        if (!name) return alert("กรุณาใส่ชื่อ!");

        const snap = await get(ref(db, `rooms/${roomId}/players`));
        if (snap.exists()) {
            const players = snap.val();
            if (Object.values(players).some(p => p.name === name)) return alert("ชื่อซ้ำ!");
            if (Object.keys(players).length >= 10) return alert("ห้องเต็ม!");
        }

        // ตั้งค่า OnDisconnect: ถ้าปิดเว็บ ให้ลบชื่อเราออก
        onDisconnect(ref(db, `rooms/${roomId}/players/${myId}`)).remove();

        await set(ref(db, `rooms/${roomId}/players/${myId}`), { name: name, isHost: false });
        currentRoomId = roomId;
        showRoom(roomId);
    };

    // --- 4. สร้างห้องใหม่ ---
    btnCreate.onclick = async () => {
        const name = usernameInput.value.trim();
        if (!name) return alert("กรุณาใส่ชื่อ!");

        const newRoomRef = push(ref(db, 'rooms'));
        const roomId = newRoomRef.key;

        // **จุดสำคัญ**: สั่ง Firebase Server ว่าถ้า Host หลุด ให้ลบห้องนี้ทิ้งเลย
        // (เดี๋ยวถ้ามีคนจอยเพิ่ม เราค่อยไปยกเลิกคำสั่งนี้ในเครื่องคนจอย)
        onDisconnect(ref(db, `rooms/${roomId}`)).remove();

        await set(newRoomRef, {
            hostId: myId,
            players: { [myId]: { name: name, isHost: true } }
        });
        currentRoomId = roomId;
        showRoom(roomId);
    };

    btnJoin.onclick = () => window.directJoin(roomInput.value.trim());

    // --- 5. ระบบ Real-time + Host Migration + Auto Delete ---
    function showRoom(id) {
        lobbyDiv.style.display = 'none';
        gameRoomDiv.style.display = 'block';
        roomIdText.innerText = id;

        onValue(ref(db, `rooms/${id}`), async (snapshot) => {
            const roomData = snapshot.val();
            
            // ตรวจสอบห้องร้าง (ถ้ามีข้อมูลแต่ไม่มีคน)
            if (!roomData || !roomData.players) {
                if (roomData) await remove(ref(db, `rooms/${id}`)); // ลบกิ่ง ID ห้องทิ้ง
                
                if (currentRoomId === id) {
                    currentRoomId = null;
                    gameRoomDiv.style.display = 'none';
                    lobbyDiv.style.display = 'block';
                }
                return;
            }

            const players = roomData.players;
            const pIds = Object.keys(players);
            
            // ส่งต่อ Host ถ้าคนเดิมออก
            if (!players[roomData.hostId]) {
                const newHostId = pIds[0];
                const updates = {};
                updates[`/rooms/${id}/hostId`] = newHostId;
                updates[`/rooms/${id}/players/${newHostId}/isHost`] = true;
                await update(ref(db), updates);
                return;
            }

            // แสดงผลรายชื่อ
            playerCountLabel.innerText = pIds.length;
            playerList.innerHTML = "";
            pIds.forEach(pId => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${players[pId].name}</span> ${pId === roomData.hostId ? '<span class="host-badge">★ Host</span>' : ''}`;
                playerList.appendChild(li);
            });

            document.getElementById('btnStart').style.display = (roomData.hostId === myId) ? 'block' : 'none';
        });
    }
});