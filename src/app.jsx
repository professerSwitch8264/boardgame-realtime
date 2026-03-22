import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase.js'; 
import { ref, set, push, onValue, get, query, limitToLast, remove, onDisconnect, update, off } from "firebase/database";

const avatarsList = ["🐱", "🐶", "🦊", "🦁", "🐸", "🐵", "🦄", "🐼", "🐙", "👻", "🐯", "🐨", "🐰", "🐹", "👽", "🤖"];
const playerColors = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16"];

export default function BoardGame() {
  // --- States ---
  const myId = useRef("p_" + Math.random().toString(36).substr(2, 9)).current;
  const [username, setUsername] = useState("");
  const [searchRoomText, setSearchRoomText] = useState("");
  const [chatText, setChatText] = useState("");
  const [sidebarChatText, setSidebarChatText] = useState(""); 
  
  const [allRooms, setAllRooms] = useState({});
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);

  const [dragState, setDragState] = useState({ id: null, source: null });

  const [dropMode, setDropMode] = useState('show'); 
  const [cardMenu, setCardMenu] = useState(null); 
  const [activeMove, setActiveMove] = useState(null); 
  const [mousePx, setMousePx] = useState({ x: 0, y: 0 }); 
  
  const tableRef = useRef(null); 

  const [activeSidebarTab, setActiveSidebarTab] = useState('log');
  const logEndRef = useRef(null);
  const chatEndRef = useRef(null);

  // --- โหลดข้อมูลห้องทั้งหมด (Lobby) ---
  useEffect(() => {
    const roomsQuery = query(ref(db, 'rooms'), limitToLast(20));
    const unsubscribe = onValue(roomsQuery, (snapshot) => {
      setAllRooms(snapshot.val() || {});
    });
    return () => unsubscribe();
  }, []);

  // --- โหลดข้อมูลห้องปัจจุบัน (เมื่อกดเข้าห้อง) ---
  useEffect(() => {
    if (!currentRoomId) {
      setRoomData(null);
      return;
    }

    const roomRef = ref(db, `rooms/${currentRoomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data || !data.players || !data.players[myId]) {
        setCurrentRoomId(null);
        setRoomData(null);
        onDisconnect(ref(db, `rooms/${currentRoomId}/players/${myId}`)).cancel();
      } else {
        setRoomData(data);
      }
    });

    return () => unsubscribe();
  }, [currentRoomId, myId]);

  // เลื่อน Sidebar ลงมาล่าสุด
  useEffect(() => {
    if (activeSidebarTab === 'log' && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    if (activeSidebarTab === 'chat' && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roomData?.logs, roomData?.messages, activeSidebarTab]);

  // ระบบปรับองศาด้วยคีย์บอร์ด (ลูกศรขึ้น/ลง) ทีละ 1 องศา
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeMove) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
          e.preventDefault(); // ป้องกันการเลื่อนหน้าจอ
          setActiveMove(prev => ({ ...prev, rot: prev.rot + 1 }));
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
          e.preventDefault(); // ป้องกันการเลื่อนหน้าจอ
          setActiveMove(prev => ({ ...prev, rot: prev.rot - 1 }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeMove]);

  // --- Functions: การจัดการ Lobby ---
  const getFreeAvatar = (roomPlayers) => {
    const usedAvatars = Object.values(roomPlayers || {}).map(p => p.avatar);
    return avatarsList.find(a => !usedAvatars.includes(a)) || avatarsList[0];
  };

  const getFreeColor = (roomPlayers) => {
    const usedColors = Object.values(roomPlayers || {}).map(p => p.color);
    return playerColors.find(c => !usedColors.includes(c)) || playerColors[Math.floor(Math.random() * playerColors.length)];
  };

  const createRoom = async () => {
    const name = username.trim();
    if (!name) return alert("ตั้งชื่อก่อน!");
    const newRoomRef = push(ref(db, 'rooms'));
    const rid = newRoomRef.key;
    
    onDisconnect(ref(db, `rooms/${rid}/players/${myId}`)).remove();
    
    await set(newRoomRef, { 
      hostId: myId, 
      status: "waiting", 
      players: { 
        [myId]: { name, avatar: avatarsList[0], color: playerColors[0], isHost: true, lastMsg: null } 
      } 
    });
    setCurrentRoomId(rid);
  };

  const joinRoom = async (roomId) => {
    const name = username.trim();
    if (!name) return alert("ตั้งชื่อก่อน!");
    
    const roomSnap = await get(ref(db, `rooms/${roomId}`));
    if (!roomSnap.exists()) return;
    
    const data = roomSnap.val();
    if (data.status === "playing") return alert("เขาระหว่างเล่นไม่ได้!");
    
    const freeAv = getFreeAvatar(data.players);
    const freeCol = getFreeColor(data.players);

    onDisconnect(ref(db, `rooms/${roomId}/players/${myId}`)).remove();
    await set(ref(db, `rooms/${roomId}/players/${myId}`), { name, avatar: freeAv, color: freeCol, isHost: false, lastMsg: null });
    setCurrentRoomId(roomId);
  };

  const leaveRoom = async () => {
    if (!currentRoomId) return;
    const rid = currentRoomId;
    setCurrentRoomId(null);
    setRoomData(null);
    
    await remove(ref(db, `rooms/${rid}/players/${myId}`));
    const snap = await get(ref(db, `rooms/${rid}/players`));
    if (!snap.exists()) {
      await remove(ref(db, `rooms/${rid}`));
    }
  };

  const kickPlayer = async (targetId) => {
    if (window.confirm("เตะผู้เล่นคนนี้ออกใช่ไหม?")) {
      remove(ref(db, `rooms/${currentRoomId}/players/${targetId}`));
    }
  };

  const transferHost = async (targetId) => {
    if (!window.confirm("โอนหัวหน้าห้อง?")) return;
    const updates = {};
    updates[`/rooms/${currentRoomId}/hostId`] = targetId;
    updates[`/rooms/${currentRoomId}/players/${myId}/isHost`] = false;
    updates[`/rooms/${currentRoomId}/players/${targetId}/isHost`] = true;
    await update(ref(db), updates);
  };

  const changeAvatar = async (av) => {
    if (!roomData) return;
    const takenAvatars = {};
    Object.keys(roomData.players).forEach(pId => {
      takenAvatars[roomData.players[pId].avatar] = pId;
    });

    if (takenAvatars[av] && takenAvatars[av] !== myId) return;
    await update(ref(db, `rooms/${currentRoomId}/players/${myId}`), { avatar: av });
  };

  // ฟังก์ชันเพิ่ม Log แบบระบุตัวตน (สีและชื่อ)
  const addLog = async (text, playerId = myId) => {
    if (!currentRoomId || !roomData) return;
    
    let pName = "ระบบ";
    let pColor = "#94a3b8"; 
    
    // ถ้าระบุตัวผู้เล่น ให้ดึงสีและชื่อของคนนั้นมา
    if (playerId && playerId !== "system" && roomData.players[playerId]) {
      pName = roomData.players[playerId].name;
      pColor = roomData.players[playerId].color;
    }

    const logRef = push(ref(db, `rooms/${currentRoomId}/logs`));
    await set(logRef, {
      text: text,
      pName: pName,
      pColor: pColor,
      timestamp: Date.now()
    });
  };

  const sendMessage = async (isFromSidebar = false) => {
    const msg = isFromSidebar ? sidebarChatText.trim() : chatText.trim();
    if (!msg || !currentRoomId || !roomData) return;
    
    const senderName = roomData.players[myId].name;
    const senderAvatar = roomData.players[myId].avatar;

    const msgRef = push(ref(db, `rooms/${currentRoomId}/messages`));
    await set(msgRef, {
      senderId: myId,
      senderName: senderName,
      senderAvatar: senderAvatar,
      text: msg,
      timestamp: Date.now()
    });

    const myMsgRef = ref(db, `rooms/${currentRoomId}/players/${myId}/lastMsg`);
    await set(myMsgRef, msg);
    
    if (isFromSidebar) setSidebarChatText("");
    else setChatText("");
    
    setTimeout(async () => {
      const snap = await get(myMsgRef);
      if (snap.val() === msg) await set(myMsgRef, null);
    }, 4000);
  };

  const startGame = async () => {
    if (!currentRoomId || !roomData) return;
    const updates = {};
    const sampleCards = ["⚔️", "🛡️", "🪄", "🧪", "💎", "📜", "🏹", "🔔"];

    Object.keys(roomData.players).forEach(pId => {
      updates[`rooms/${currentRoomId}/table`] = null; 
      updates[`rooms/${currentRoomId}/requests`] = null; 
      for (let i = 0; i < 5; i++) {
        const cardKey = "c_" + Math.random().toString(36).substr(2, 7);
        updates[`rooms/${currentRoomId}/players/${pId}/hand/${cardKey}`] = {
          val: sampleCards[Math.floor(Math.random() * sampleCards.length)]
        };
      }
    });
    
    await update(ref(db), updates);
    await update(ref(db, `rooms/${currentRoomId}`), { status: "playing" });
    
    addLog("เริ่มเกมแล้ว! แจกไพ่คนละ 5 ใบ", "system");
  };

  const backToLobbyFromGame = async () => {
    if(window.confirm("ต้องการจบเกมหรือออกจากหน้าเล่นเกม?")) {
      update(ref(db, `rooms/${currentRoomId}`), { status: "waiting" });
      addLog("เกมถูกยกเลิกกลับไปหน้า LOBBY", "system");
    }
  };

  // --- Request System (ขอหยิบการ์ด) ---
  const sendRequestToTakeCard = async (cardId, cardData, source = 'table', targetPlayerId = null) => {
    const ownerId = source === 'table' ? cardData.ownerId : targetPlayerId;
    const ownerName = roomData.players[ownerId].name;

    const isCardBeingRequested = roomData.requests && Object.values(roomData.requests).some(req => req.cardId === cardId);
    if (isCardBeingRequested) {
      return alert("❌ ไพ่ใบนี้กำลังถูกคนอื่นขออยู่ โปรดรอสักครู่!");
    }

    let confirmMsg = `การ์ดใบนี้เป็นของ ${ownerName}\nคุณต้องการส่งคำขอหยิบการ์ดใบนี้บนโต๊ะหรือไม่?`;
    if (source === 'hand') {
      confirmMsg = `ต้องการส่งคำขอ 'สุ่มดึงไพ่บนมือ' ของ ${ownerName} ใช่ไหม?`;
    }

    if (window.confirm(confirmMsg)) {
      const reqRef = push(ref(db, `rooms/${currentRoomId}/requests`));
      await set(reqRef, {
        from: myId,
        fromName: roomData.players[myId].name,
        to: ownerId,
        cardId: cardId,
        cardVal: cardData.val,
        source: source
      });
      addLog(source === 'hand' ? `ส่งคำขอดึงไพ่บนมือ` : `ส่งคำขอหยิบไพ่บนโต๊ะ`);
    }
  };

  const approveRequest = async (reqId, req) => {
    const updates = {};

    if (req.source === 'table') {
      if (!roomData?.table?.[req.cardId]) {
        alert("❌ ไพ่ใบนี้ไม่อยู่บนโต๊ะแล้ว! คำขอถูกยกเลิกอัตโนมัติ");
        await remove(ref(db, `rooms/${currentRoomId}/requests/${reqId}`));
        return;
      }
      updates[`rooms/${currentRoomId}/table/${req.cardId}`] = null;
    } else if (req.source === 'hand') {
      if (!roomData?.players?.[req.to]?.hand?.[req.cardId]) {
        alert("❌ ไพ่ใบนี้ไม่อยู่ในมือแล้ว (อาจถูกเล่นไปแล้ว)! คำขอถูกยกเลิกอัตโนมัติ");
        await remove(ref(db, `rooms/${currentRoomId}/requests/${reqId}`));
        return;
      }
      updates[`rooms/${currentRoomId}/players/${req.to}/hand/${req.cardId}`] = null;
    }

    updates[`rooms/${currentRoomId}/players/${req.from}/hand/${req.cardId}`] = { val: req.cardVal };
    updates[`rooms/${currentRoomId}/requests/${reqId}`] = null;
    
    await update(ref(db), updates);
    addLog(`อนุญาตให้ ${req.fromName} หยิบไพ่ไป`);
  };

  const rejectRequest = async (reqId, req) => {
    await remove(ref(db, `rooms/${currentRoomId}/requests/${reqId}`));
    addLog(`ปฏิเสธคำขอหยิบไพ่ของ ${req.fromName}`);
  };


  // --- ระบบ Drag & Drop ทั่วไป (จากมือลงโต๊ะ) ---
  const handleDragStart = (id, source) => {
    setDragState({ id, source });
  };

  const handleTableDrop = async (e) => {
    e.preventDefault();
    const { id: draggedCardId, source: dragSource } = dragState;
    if (!draggedCardId || !currentRoomId || !roomData) return;

    const rect = tableRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const rot = Math.floor(Math.random() * 50) - 25;
    // Layer บนสุดเสมอ
    const topLayerZ = Date.now() % 1000000000;

    const updates = {};

    if (dragSource === 'hand') {
      const cardRef = ref(db, `rooms/${currentRoomId}/players/${myId}/hand/${draggedCardId}`);
      const cardSnap = await get(cardRef);
      
      if (cardSnap.exists()) {
        const cardData = cardSnap.val();
        const isHidden = dropMode === 'hide'; 
        updates[`rooms/${currentRoomId}/table/${draggedCardId}`] = { 
          val: cardData.val, x, y, rot, ownerId: myId, isHidden, z: topLayerZ 
        };
        updates[`rooms/${currentRoomId}/players/${myId}/hand/${draggedCardId}`] = null;
        
        if (isHidden) addLog(`ลงไพ่หมอบ 1 ใบ บนโต๊ะ`);
        else addLog(`ลงไพ่ [ ${cardData.val} ] บนโต๊ะ`);
      }
    } else if (dragSource === 'table') {
      updates[`rooms/${currentRoomId}/table/${draggedCardId}/x`] = x;
      updates[`rooms/${currentRoomId}/table/${draggedCardId}/y`] = y;
      updates[`rooms/${currentRoomId}/table/${draggedCardId}/z`] = topLayerZ;
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }
    setDragState({ id: null, source: null });
  };

  const handleHandDrop = async (e) => {
    e.preventDefault();
    setDragState({ id: null, source: null });
  };

  // --- ระบบคลิกที่ไพ่บนโต๊ะ (เมนูจัดการไพ่) ---
  const handleTableCardClick = (cId, cData, e) => {
    if(!currentRoomId || !roomData) return;
    e.stopPropagation(); 
    
    if (cData.ownerId === myId) {
      setCardMenu({ id: cId, data: cData, x: e.clientX, y: e.clientY });
    } else {
      sendRequestToTakeCard(cId, cData, 'table');
    }
  };

  const menuRevealCard = async () => {
    await update(ref(db, `rooms/${currentRoomId}/table/${cardMenu.id}`), { isHidden: false });
    addLog(`เปิดไพ่ที่หมอบอยู่ พบว่าเป็น [ ${cardMenu.data.val} ]`);
    setCardMenu(null);
  };

  const menuHideCard = async () => {
    await update(ref(db, `rooms/${currentRoomId}/table/${cardMenu.id}`), { isHidden: true });
    addLog(`คว่ำไพ่กลับไปเป็นหมอบ`);
    setCardMenu(null);
  };

  const menuStartMove = () => {
    setActiveMove({ id: cardMenu.id, data: cardMenu.data, rot: cardMenu.data.rot || 0 });
    setMousePx({ x: cardMenu.x, y: cardMenu.y });
    setCardMenu(null);
  };

  const menuTakeToHand = async () => {
    const updates = {};
    updates[`rooms/${currentRoomId}/players/${myId}/hand/${cardMenu.id}`] = { val: cardMenu.data.val };
    updates[`rooms/${currentRoomId}/table/${cardMenu.id}`] = null;
    await update(ref(db), updates);
    addLog(`เก็บไพ่ขึ้นมือ`);
    setCardMenu(null);
  };

  // --- ระบบ Move Mode (ตามเมาส์ & หมุนลูกกลิ้ง) ---
  const handleGlobalPointerMove = (e) => {
    if (activeMove) {
      setMousePx({ x: e.clientX, y: e.clientY });
    }
  };

  const handleGlobalWheel = (e) => {
    if (activeMove) {
      setActiveMove(prev => ({
        ...prev,
        rot: prev.rot + (e.deltaY > 0 ? 15 : -15) 
      }));
    }
  };

  const handleGlobalClick = async (e) => {
    if (cardMenu) setCardMenu(null); 

    if (activeMove) {
      if (mousePx.y > window.innerHeight - 180) {
        // ลงมือ
        const updates = {};
        updates[`rooms/${currentRoomId}/players/${myId}/hand/${activeMove.id}`] = { val: activeMove.data.val };
        updates[`rooms/${currentRoomId}/table/${activeMove.id}`] = null;
        await update(ref(db), updates);
        addLog(`เคลื่อนย้าย: เก็บไพ่ขึ้นมือ`);
      } else if (tableRef.current) {
        // ลงโต๊ะพร้อมจัด Layer
        const rect = tableRef.current.getBoundingClientRect();
        const x = ((mousePx.x - rect.left) / rect.width) * 100;
        const y = ((mousePx.y - rect.top) / rect.height) * 100;
        const topLayerZ = Date.now() % 1000000000;

        const updates = {};
        updates[`rooms/${currentRoomId}/table/${activeMove.id}/x`] = x;
        updates[`rooms/${currentRoomId}/table/${activeMove.id}/y`] = y;
        updates[`rooms/${currentRoomId}/table/${activeMove.id}/rot`] = activeMove.rot;
        updates[`rooms/${currentRoomId}/table/${activeMove.id}/z`] = topLayerZ;
        await update(ref(db), updates);
      }
      setActiveMove(null); 
    }
  };


  // --- Render Helpers ---
  const filteredRooms = Object.keys(allRooms).filter(rId => 
    rId.substring(0, 6).toUpperCase().includes(searchRoomText.toUpperCase())
  );

  const amIHost = roomData?.hostId === myId;
  const isPlaying = roomData?.status === "playing";
  
  const myRequests = roomData?.requests 
    ? Object.entries(roomData.requests).filter(([_, req]) => req.to === myId) 
    : [];

  const cssStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600&display=swap');

    :root {
      --primary: #6366f1;
      --primary-light: #e0e7ff;
      --secondary: #10b981;
      --danger: #ef4444;
      --muted: #94a3b8;
      --card-bg: rgba(255, 255, 255, 0.98);
      --wood-dark: #3e2723;
      --wood-light: #5d4037;
      --felt-green: #1b5e20;
      --felt-light: #2e7d32;
    }

    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    body { 
      font-family: 'Kanit', sans-serif; 
      background: radial-gradient(circle at top right, #111827, #030712);
      margin: 0; display: flex; justify-content: center; align-items: center;
      min-height: 100vh; color: #1e293b; overflow: hidden;
    }

    .container { width: 95%; max-width: 420px; height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 20px 0; }

    .card { 
      background: var(--card-bg); padding: 25px; border-radius: 32px; 
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); 
      display: flex; flex-direction: column; gap: 15px;
      max-height: 90vh; overflow: hidden;
    }

    .card-main-title {
      margin: 0 0 5px 0; font-size: 1.5rem; font-weight: 800;
      color: var(--primary); text-align: center; letter-spacing: 1px; text-transform: uppercase;
    }

    .styled-input {
      width: 100%; padding: 12px 18px; border: 2px solid #f1f5f9; 
      border-radius: 15px; font-family: inherit; font-size: 1rem;
      outline: none; transition: 0.2s; background: #f8fafc;
    }
    .styled-input:focus { border-color: var(--primary); background: white; }

    .avatar-wrapper { display: flex; align-items: center; gap: 5px; }
    .nav-btn {
      background: white; border: 1px solid #e2e8f0; border-radius: 50%;
      width: 32px; height: 32px; cursor: pointer; display: flex;
      align-items: center; justify-content: center; color: var(--primary);
      box-shadow: 0 2px 5px rgba(0,0,0,0.1); flex-shrink: 0;
    }

    .avatar-scroll-container {
      display: flex; overflow-x: auto; gap: 10px; padding: 10px 5px;
      scrollbar-width: none; scroll-behavior: smooth; flex-grow: 1;
    }
    .avatar-scroll-container::-webkit-scrollbar { display: none; }

    .avatar-item {
      font-size: 1.8rem; min-width: 55px; height: 55px;
      display: flex; align-items: center; justify-content: center;
      background: white; border-radius: 16px; cursor: pointer;
      border: 3px solid #f1f5f9; transition: 0.2s; flex-shrink: 0;
    }
    .avatar-item.selected { border-color: var(--primary); background: var(--primary-light); transform: scale(1.05); }
    .avatar-item.disabled { opacity: 0.3; cursor: not-allowed; filter: grayscale(100%); }

    .room-list-scroll { overflow-y: auto; flex-grow: 1; display: flex; flex-direction: column; gap: 8px; min-height: 100px; }
    .empty-rooms { text-align: center; padding: 30px 10px; background: #f8fafc; border-radius: 20px; border: 2px dashed #e2e8f0; }

    .room-item { 
      background: white; border: 1px solid #f1f5f9; padding: 12px 15px; 
      border-radius: 18px; display: flex; justify-content: space-between; align-items: center; 
    }

    .list-layout { display: flex; flex-direction: column; gap: 10px; padding: 10px 0; overflow-y: auto; flex-grow: 1; }
    .player-card {
      background: white; border-radius: 20px; height: 75px;
      display: flex; align-items: center; padding: 0 18px; position: relative;
      box-shadow: 0 4px 10px rgba(0,0,0,0.03); border: 2px solid #f1f5f9; flex-shrink: 0;
    }
    .player-card.is-me { border-color: var(--primary); background: #f5f7ff; }

    .player-icon { 
      font-size: 1.8rem; margin-right: 15px; width: 45px; height: 45px;
      position: relative; display: flex; align-items: center; justify-content: center;
    }
    .host-crown { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); font-size: 0.9rem; z-index: 5; }
    .player-name { font-size: 1rem; font-weight: 600; color: #334155; flex-grow: 1; }

    .host-controls { display: flex; gap: 5px; margin-left: 10px; }
    .btn-kick { background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; padding: 6px 10px; border-radius: 10px; font-size: 0.8rem; cursor: pointer; }
    .btn-transfer { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; padding: 6px 10px; border-radius: 10px; font-size: 0.8rem; cursor: pointer; }

    .bottom-section { margin-top: auto; display: flex; flex-direction: column; gap: 16px; padding-top: 10px; flex-shrink: 0; }
    .chat-input-group { display: flex; align-items: center; gap: 8px; background: #f1f5f9; padding: 6px; border-radius: 20px; }
    .chat-input-group input { flex: 1; border: none; background: transparent; padding: 10px; outline: none; font-family: inherit; }
    .btn-send-icon { background: var(--primary); color: white; border: none; width: 45px; height: 45px; border-radius: 15px; cursor: pointer; font-size: 1.2rem; }

    .btn-primary-sm { 
      background: linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%); 
      color: white; border: none; padding: 10px 18px; border-radius: 12px; 
      font-weight: 600; font-size: 0.85rem; cursor: pointer; 
      box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: all 0.2s;
    }
    .btn-primary-sm:hover { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(99, 102, 241, 0.3); }
    .btn-primary-sm:active { transform: translateY(1px); box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2); }

    .btn-start-game {
      width: 100%; height: 52px; border: none; border-radius: 18px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white; font-weight: 800; font-size: 1.1rem; cursor: pointer;
    }

    .btn-muted { width: 100%; height: 35px; border: none; background: transparent; color: var(--muted); font-size: 0.9rem; cursor: pointer; }

    /* --- Game Play Area CSS --- */
    .game-play-area {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.85); display: flex; flex-direction: row; z-index: 100;
      backdrop-filter: blur(10px);
    }

    .game-main-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }

    /* Floating Request Box */
    .requests-container {
      position: absolute; top: 80px; left: 50%; transform: translateX(-50%); z-index: 200;
      display: flex; flex-direction: column; gap: 10px;
    }
    .request-alert {
      background: rgba(30, 41, 59, 0.95); border: 2px solid var(--primary);
      color: white; padding: 12px 20px; border-radius: 15px;
      display: flex; align-items: center; gap: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.6);
      backdrop-filter: blur(5px); animation: dropDown 0.3s ease-out;
    }
    @keyframes dropDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    .req-btns { display: flex; gap: 8px; }
    .req-btn-approve { background: var(--secondary); border: none; color: white; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 600; transition: 0.2s;}
    .req-btn-approve:hover { filter: brightness(1.1); transform: scale(1.05); }
    .req-btn-reject { background: var(--danger); border: none; color: white; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 600; transition: 0.2s;}
    .req-btn-reject:hover { filter: brightness(1.1); transform: scale(1.05); }

    /* Context Menu CSS */
    .card-context-menu {
      position: fixed; background: #1e293b; border: 1px solid #475569;
      border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 5px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.8); z-index: 9999;
      transform: translate(-50%, -100%); margin-top: -15px;
    }
    .card-context-menu button {
      background: rgba(255,255,255,0.1); color: white; border: none; padding: 10px 15px;
      border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 0.9rem; transition: 0.2s;
    }
    .card-context-menu button:hover { background: var(--primary); }

    .game-sidebar {
      width: 320px; background: rgba(15, 23, 42, 0.9);
      border-left: 2px solid rgba(255,255,255,0.1); display: flex; flex-direction: column;
      box-shadow: -10px 0 30px rgba(0,0,0,0.5);
    }

    .game-header {
      padding: 10px 15px; display: flex; justify-content: space-between;
      align-items: center; background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent); color: white; gap: 10px;
    }

    .btn-exit-game {
      background: var(--danger); color: white; border: none; padding: 8px 12px;
      border-radius: 12px; font-weight: 600; cursor: pointer; font-family: inherit; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    }

    .other-players-row { display: flex; gap: 12px; overflow-x: auto; flex: 1; padding: 10px; justify-content: center; }
    .mini-player-card {
      background: rgba(0, 0, 0, 0.6); color: white; padding: 6px 15px; border-radius: 30px;
      display: flex; align-items: center; gap: 8px; min-width: 120px;
      box-shadow: 0 4px 10px rgba(0,0,0,0.4); backdrop-filter: blur(5px);
      border: 2px solid;
    }

    .mini-card-back {
      width: 18px; height: 26px;
      background: repeating-linear-gradient(45deg, #1e293b, #1e293b 3px, #475569 3px, #475569 6px);
      border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 2px 2px 4px rgba(0,0,0,0.5);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .clickable-card:hover {
      transform: translateY(-8px); cursor: pointer;
      box-shadow: 0 5px 10px rgba(0,0,0,0.8);
      border-color: white; z-index: 50 !important;
    }

    .game-table {
      flex: 1; margin: 15px; 
      border: 14px solid var(--wood-dark); border-radius: 50px; position: relative; 
      background: radial-gradient(circle, var(--felt-light) 0%, var(--felt-green) 100%);
      box-shadow: inset 0 0 60px rgba(0,0,0,0.8), 0 15px 35px rgba(0,0,0,0.6); overflow: hidden;
    }
    
    .game-table::before {
      content: ''; position: absolute; top: -14px; left: -14px; right: -14px; bottom: -14px;
      border: 4px solid rgba(255,255,255,0.1); border-radius: 50px; pointer-events: none;
    }

    .table-info {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: rgba(255,255,255,0.2); font-size: 1.2rem; pointer-events: none; text-align: center;
      text-shadow: 0 -1px 1px rgba(0,0,0,0.5); font-weight: 600; letter-spacing: 1px;
    }

    .player-hand-section {
      background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%);
      padding: 0 15px 20px 15px; display: flex; flex-direction: column; align-items: center; gap: 10px;
    }

    .drop-mode-toggle {
      display: flex; gap: 10px; background: rgba(0,0,0,0.5); padding: 8px 15px; border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.1); align-items: center;
    }
    .drop-mode-toggle button {
      background: transparent; color: var(--muted); border: 1px solid transparent; padding: 5px 12px;
      border-radius: 12px; cursor: pointer; font-family: inherit; font-size: 0.85rem; font-weight: 600; transition: 0.2s;
    }
    .drop-mode-toggle button.active {
      background: rgba(255,255,255,0.1); color: white; border-color: var(--primary);
    }

    .my-hand { 
      display: flex; justify-content: center; align-items: flex-end; 
      min-height: 130px; width: 100%; overflow-x: auto; padding: 5px 10px 0 10px; transition: 0.3s;
    }

    .card-item {
      width: 80px; height: 115px; 
      background: #FAFAFA; background-image: linear-gradient(-45deg, transparent 95%, rgba(0,0,0,0.05) 100%);
      border-radius: 8px; box-shadow: -2px 5px 12px rgba(0,0,0,0.5);
      cursor: grab; display: flex; align-items: center; justify-content: center;
      font-size: 2.5rem; flex-shrink: 0;
      transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease;
      user-select: none;
    }
    .card-item:active { cursor: grabbing; opacity: 0.8; transform: scale(1.05); }

    /* ไพ่ที่หมอบอยู่แบบคนอื่นมอง */
    .card-hidden {
      background: repeating-linear-gradient(45deg, #1e293b, #1e293b 8px, #334155 8px, #334155 16px) !important;
      border: 2px solid #cbd5e1 !important; color: transparent !important;
    }
    .card-hidden::after {
      content: '❓'; font-size: 2rem; position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%); color: rgba(255,255,255,0.7);
    }

    /* ไพ่ที่หมอบอยู่แบบเจ้าของมอง (หน้าใส แต่มีป้ายบอก) */
    .card-hidden-mine {
      position: relative;
      opacity: 0.85;
    }
    .card-hidden-mine::after {
      content: 'หมอบ'; position: absolute; top: -10px; right: -10px;
      background: var(--danger); color: white; font-size: 0.65rem; font-weight: 800;
      padding: 3px 6px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.6);
      border: 2px solid white; z-index: 20; line-height: 1;
    }

    .my-hand .card-item { margin-left: -35px; transform-origin: bottom center; border: 2px solid #E0E0E0; }
    .my-hand .card-item:first-child { margin-left: 0; }
    .my-hand .card-item:hover {
      transform: translateY(-25px) scale(1.1); z-index: 20;
      box-shadow: 0 15px 25px rgba(0,0,0,0.6); border-color: var(--primary) !important;
    }

    .card-on-table { 
      position: absolute; transform-origin: center; z-index: 10; cursor: pointer; 
      box-shadow: 2px 4px 8px rgba(0,0,0,0.6);
    }
    .card-on-table:hover {
      filter: brightness(1.1); transform: scale(1.05) !important;
    }

    /* --- Sidebar CSS --- */
    .sidebar-tabs { display: flex; background: rgba(0,0,0,0.3); border-bottom: 1px solid rgba(255,255,255,0.1); }
    .sidebar-tabs button {
      flex: 1; padding: 15px; background: transparent; border: none; color: var(--muted);
      font-family: inherit; font-size: 1rem; font-weight: 600; cursor: pointer; transition: 0.2s;
    }
    .sidebar-tabs button.active { color: white; background: rgba(255,255,255,0.05); border-bottom: 2px solid var(--primary); }

    .sidebar-content { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
    
    .log-item {
      font-size: 0.85rem; background: rgba(255,255,255,0.05);
      padding: 8px 12px; border-radius: 8px; border-left: 3px solid var(--secondary);
    }
    .log-time { font-size: 0.65rem; color: #64748b; margin-bottom: 3px; display: block; }

    .chat-msg {
      background: rgba(255,255,255,0.1); padding: 10px 12px; border-radius: 12px;
      color: white; font-size: 0.9rem; align-self: flex-start; max-width: 90%;
    }
    .chat-msg.my-msg { background: var(--primary); align-self: flex-end; }
    .chat-sender { font-size: 0.7rem; color: #94a3b8; margin-bottom: 4px; display: flex; gap: 5px; align-items: center; }
    .chat-msg.my-msg .chat-sender { color: #c7d2fe; justify-content: flex-end; }

    .sidebar-input-area { padding: 15px; background: rgba(0,0,0,0.4); border-top: 1px solid rgba(255,255,255,0.1); }
    .sidebar-input-area .chat-input-group { background: rgba(0,0,0,0.5); }
    .sidebar-input-area input { color: white; }
    .sidebar-input-area input::placeholder { color: #64748b; }
  `;

  // --- Views ---
  
  if (!currentRoomId) {
    return (
      <div className="container">
        <style dangerouslySetInnerHTML={{ __html: cssStyles }} />
        <div className="card" id="lobby">
          <h2 className="card-main-title">🏰 LOBBY</h2>
          
          <div className="form-group">
            <label htmlFor="username">👤 ตั้งชื่อเล่นของคุณ</label>
            <input 
              type="text" 
              id="username" 
              className="styled-input" 
              placeholder="เช่น Punchy" 
              maxLength="12"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="separator"></div>
          
          <div className="lobby-header-row">
            <h4>🏘️ รายชื่อห้อง</h4>
            <button className="btn-primary-sm" onClick={createRoom}>🎮 สร้างห้องใหม่</button>
          </div>

          <div className="search-area">
            <input 
              type="text" 
              className="styled-input" 
              placeholder="🔍 ค้นหาตามชื่อห้อง (6 หลัก)..." 
              maxLength="6"
              value={searchRoomText}
              onChange={(e) => setSearchRoomText(e.target.value)}
            />
          </div>
          
          <div className="room-list-scroll">
            {filteredRooms.length === 0 ? (
              <div className="empty-rooms">
                <p>{searchRoomText ? 'ไม่พบห้อง' : 'ไม่มีห้องว่าง'}</p>
              </div>
            ) : (
              filteredRooms.map(rId => {
                const room = allRooms[rId];
                if (!room.players) return null;
                const pCount = Object.keys(room.players).length;
                const isRoomPlaying = room.status === "playing";

                return (
                  <div key={rId} className="room-item">
                    <div>
                      <b>🏠 {rId.substring(0,6).toUpperCase()}</b><br/>
                      <small>{pCount}/10 คน</small>
                    </div>
                    {isRoomPlaying ? (
                      <button disabled style={{background:'var(--muted)', color:'white', border:'none', borderRadius:'10px', padding:'8px'}}>กำลังเล่น</button>
                    ) : (
                      <button onClick={() => joinRoom(rId)} className="btn-primary-sm" style={{padding:'8px 15px'}}>เข้า</button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  if (roomData && !isPlaying) {
    const pIds = Object.keys(roomData.players || {});
    const takenAvatars = {};
    pIds.forEach(pId => { takenAvatars[roomData.players[pId].avatar] = pId; });

    return (
      <div className="container">
        <style dangerouslySetInnerHTML={{ __html: cssStyles }} />
        <div className="card game-area">
          <h2 className="card-main-title">⚙️ ROOM SETUP</h2>

          <div className="room-info">
            <span className="badge-id">ID: {currentRoomId.substring(0,6).toUpperCase()}</span>
            <span className="player-count">👥 <span>{pIds.length}</span>/10</span>
          </div>

          <div className="avatar-selection" style={{marginTop: "10px", marginBottom: "5px"}}>
            <h4>🎭 เลือกตัวละครของคุณ</h4>
            <div className="avatar-wrapper">
              <button className="nav-btn">❮</button>
              <div className="avatar-scroll-container">
                {avatarsList.map(av => {
                  const isSelectedByMe = takenAvatars[av] === myId;
                  const isDisabled = takenAvatars[av] && !isSelectedByMe;
                  return (
                    <div 
                      key={av}
                      className={`avatar-item ${isSelectedByMe ? 'selected' : (isDisabled ? 'disabled' : '')}`}
                      onClick={() => changeAvatar(av)}
                    >
                      {av}
                    </div>
                  );
                })}
              </div>
              <button className="nav-btn">❯</button>
            </div>
          </div>

          <div className="list-layout">
            {pIds.map(pId => {
              const p = roomData.players[pId];
              const isMe = pId === myId;
              return (
                <div key={pId} className={`player-card ${isMe ? 'is-me' : ''}`} style={isMe ? {borderColor: p.color} : {}}>
                  <div className="player-icon">
                    {p.isHost && <span className="host-crown">👑</span>}
                    {p.avatar}
                  </div>
                  <div className="player-name">
                    {p.name} {isMe && <span className="me-badge" style={{backgroundColor: p.color}}>YOU</span>}
                  </div>
                  {amIHost && !isMe && (
                    <div className="host-controls">
                      <button className="btn-transfer" onClick={() => transferHost(pId)}>👑</button>
                      <button className="btn-kick" onClick={() => kickPlayer(pId)}>🚫</button>
                    </div>
                  )}
                  {p.lastMsg && <div className="chat-bubble">{p.lastMsg}</div>}
                </div>
              );
            })}
          </div>

          <div className="bottom-section">
            <div className="chat-input-group">
              <input 
                type="text" 
                placeholder="คุยกับเพื่อน..." 
                maxLength="30"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(false)}
              />
              <button className="btn-send-icon" onClick={() => sendMessage(false)}>🚀</button>
            </div>

            <div className="action-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {amIHost && (
                <button className="btn-start-game" onClick={startGame}>🔥 เริ่มเกมเลย!</button>
              )}
              <button className="btn-muted" onClick={leaveRoom}>ออกจากห้อง</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (roomData && isPlaying) {
    const tableData = roomData.table || {};
    const myHand = (roomData.players[myId] && roomData.players[myId].hand) ? roomData.players[myId].hand : {};
    const otherPlayers = Object.keys(roomData.players).filter(id => id !== myId);
    
    const logsArray = roomData.logs ? Object.values(roomData.logs).sort((a,b) => a.timestamp - b.timestamp) : [];
    const messagesArray = roomData.messages ? Object.values(roomData.messages).sort((a,b) => a.timestamp - b.timestamp) : [];

    return (
      <div 
        className="container" style={{maxWidth: '100%', padding: 0}}
        onPointerMove={handleGlobalPointerMove}
        onWheel={handleGlobalWheel}
        onClick={handleGlobalClick}
      >
        <style dangerouslySetInnerHTML={{ __html: cssStyles }} />
        
        {/* ไพ่ที่กำลังลอยตามเมาส์โหมด Free Move */}
        {activeMove && (
          <div 
            className={`card-item card-on-table ${activeMove.data.isHidden ? 'card-hidden-mine' : ''}`}
            style={{ 
              position: 'fixed',
              left: mousePx.x, 
              top: mousePx.y,
              transform: `translate(-50%, -50%) rotate(${activeMove.rot}deg)`,
              border: `3px solid ${roomData.players[myId].color}`,
              boxShadow: `0 15px 35px rgba(0,0,0,0.8)`,
              zIndex: 99999,
              pointerEvents: 'none' 
            }}
          >
            {activeMove.data.val}
          </div>
        )}

        {/* เมนูคลิกขวา/คลิกซ้ายสำหรับไพ่ส่วนตัว */}
        {cardMenu && (
          <div className="card-context-menu" style={{ left: cardMenu.x, top: cardMenu.y }} onClick={(e) => e.stopPropagation()}>
            {cardMenu.data.isHidden ? (
              <button onClick={menuRevealCard}>👁️ เปิดเผยไพ่</button>
            ) : (
              <button onClick={menuHideCard}>❓ หมอบไพ่</button>
            )}
            <button onClick={menuStartMove}>🖐️ เคลื่อนย้ายอิสระ (หมุนลูกกลิ้ง/ปุ่มขึ้นลง)</button>
            <button onClick={menuTakeToHand}>📥 เก็บขึ้นมือ</button>
          </div>
        )}

        <div className="game-play-area">
          <div className="game-main-area">
            
            {myRequests.length > 0 && (
              <div className="requests-container">
                {myRequests.map(([reqId, req]) => (
                  <div key={reqId} className="request-alert">
                    <span>
                      <b>{req.fromName}</b> ขอหยิบไพ่ 
                      {req.source === 'hand' ? ' สุ่มจากบนมือคุณ 1 ใบ' : ` [ ${req.cardVal} ] บนโต๊ะ`}
                    </span>
                    <div className="req-btns">
                      <button className="req-btn-approve" onClick={() => approveRequest(reqId, req)}>ให้</button>
                      <button className="req-btn-reject" onClick={() => rejectRequest(reqId, req)}>ไม่ให้</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="game-header">
              <span className="badge-id" style={{background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)'}}>
                ID: {currentRoomId.substring(0,6).toUpperCase()}
              </span>
              <div className="other-players-row">
                {otherPlayers.map(pId => {
                  const p = roomData.players[pId];
                  const oppHandKeys = Object.keys(p.hand || {});
                  return (
                    <div key={pId} className="mini-player-card" style={{ borderColor: p.color }}>
                      <span>{p.avatar}</span>
                      <div style={{fontSize:"0.65rem", lineHeight: "1.2", display: 'flex', flexDirection: 'column', flex: 1}}>
                        <b>{p.name}</b>
                        <div style={{display: 'flex', marginTop: '4px', marginLeft: '5px'}}>
                          {oppHandKeys.map((cId, i) => (
                             <div 
                               key={cId} 
                               className="mini-card-back clickable-card" 
                               style={{marginLeft: i > 0 ? '-10px' : '0', zIndex: i}}
                               onClick={(e) => { e.stopPropagation(); sendRequestToTakeCard(cId, p.hand[cId], 'hand', pId); }}
                               title="คลิกเพื่อขอสุ่มดึงไพ่ใบนี้"
                             ></div>
                          ))}
                        </div>
                        {p.lastMsg && <span style={{position:'absolute', top:'-20px', left:'10px', background: p.color, padding:'3px 8px', borderRadius:'10px', fontSize:'0.7rem'}}>{p.lastMsg}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="btn-exit-game" onClick={backToLobbyFromGame}>🏳️ ออก/จบเกม</button>
            </div>

            <div 
              className="game-table" 
              ref={tableRef}
              onDragOver={(e) => e.preventDefault()} 
              onDrop={handleTableDrop}
            >
              <div className="table-info">
                ลากการ์ดลงมาเล่นบนโต๊ะ<br/>(คลิกที่การ์ดตัวเองเพื่อเปิดเมนูคำสั่ง)
              </div>
              {Object.keys(tableData).map(cId => {
                const c = tableData[cId];
                const isMine = c.ownerId === myId;
                const isHidden = c.isHidden;
                const ownerColor = roomData.players[c.ownerId]?.color || "#E0E0E0";
                
                if (activeMove && activeMove.id === cId) return null;

                const showFace = !isHidden || isMine;
                const cardClass = `card-item card-on-table ${isHidden && !isMine ? 'card-hidden' : ''} ${isHidden && isMine ? 'card-hidden-mine' : ''}`;

                return (
                  <div 
                    key={cId}
                    className={cardClass}
                    style={{ 
                      left: `calc(${c.x}% - 40px)`, 
                      top: `calc(${c.y}% - 57px)`,
                      transform: `rotate(${c.rot || 0}deg)`,
                      border: `3px solid ${ownerColor}`,
                      boxShadow: `0 0 15px ${ownerColor}80, 2px 4px 8px rgba(0,0,0,0.6)`,
                      zIndex: c.z || 10
                    }}
                    draggable={false} 
                    onClick={(e) => handleTableCardClick(cId, c, e)}
                  >
                    {showFace && c.val}
                  </div>
                );
              })}
            </div>

            <div className="player-hand-section">
              <div className="drop-mode-toggle" onClick={(e) => e.stopPropagation()}>
                <span style={{color: 'white', marginRight: '5px', fontSize: '0.85rem'}}>ก่อนลากไพ่ลงโต๊ะ:</span>
                <button className={dropMode === 'show' ? 'active' : ''} onClick={() => setDropMode('show')}>👁️ แสดงไพ่</button>
                <button className={dropMode === 'hide' ? 'active' : ''} onClick={() => setDropMode('hide')}>❓ หมอบไพ่</button>
              </div>

              <div 
                className="my-hand"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleHandDrop}
              >
                {Object.keys(myHand).map(cId => {
                  const myColor = roomData.players[myId].color;
                  return (
                    <div 
                      key={cId}
                      className="card-item"
                      style={{ border: `2px solid ${myColor}` }}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); handleDragStart(cId, 'hand'); }}
                    >
                      {myHand[cId].val}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="game-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-tabs">
              <button className={activeSidebarTab === 'log' ? 'active' : ''} onClick={() => setActiveSidebarTab('log')}>📜 ประวัติ</button>
              <button className={activeSidebarTab === 'chat' ? 'active' : ''} onClick={() => setActiveSidebarTab('chat')}>💬 แชท</button>
            </div>

            <div className="sidebar-content">
              {activeSidebarTab === 'log' && (
                <>
                  {logsArray.map((log, index) => {
                    const timeStr = new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    const hasPlayer = log.pName && log.pName !== "ระบบ";
                    return (
                      <div key={index} className="log-item">
                        <span className="log-time">{timeStr}</span>
                        {hasPlayer ? (
                           <>
                             <span style={{ color: log.pColor, fontWeight: 'bold' }}>{log.pName}</span>
                             <span style={{ color: '#cbd5e1' }}> : {log.text}</span>
                           </>
                        ) : (
                           <span style={{ color: '#cbd5e1' }}>{log.text}</span>
                        )}
                      </div>
                    );
                  })}
                  <div ref={logEndRef} />
                </>
              )}

              {activeSidebarTab === 'chat' && (
                <>
                  {messagesArray.map((msg, index) => {
                    const isMe = msg.senderId === myId;
                    const timeStr = new Date(msg.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <div key={index} className={`chat-msg ${isMe ? 'my-msg' : ''}`}>
                        <div className="chat-sender">
                          {isMe ? `${timeStr} - ฉัน` : `${msg.senderAvatar} ${msg.senderName} - ${timeStr}`}
                        </div>
                        {msg.text}
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {activeSidebarTab === 'chat' && (
              <div className="sidebar-input-area">
                <div className="chat-input-group">
                  <input 
                    type="text" 
                    placeholder="พิมพ์ข้อความ..." 
                    maxLength="50"
                    value={sidebarChatText}
                    onChange={(e) => setSidebarChatText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage(true)}
                  />
                  <button className="btn-send-icon" onClick={() => sendMessage(true)}>🚀</button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  return null; 
}