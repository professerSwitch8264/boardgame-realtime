// firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// เรียกใช้ตัวแปรจาก .env ผ่าน import.meta.env
const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;

const firebaseConfig = {
  apiKey: "AIzaSy...", // แนะนำให้เอาอันนี้ไปใส่ใน .env ด้วยเพื่อความปลอดภัย
  authDomain: "your-project.firebaseapp.com",
  databaseURL: databaseURL, // ใช้ตัวแปรที่ดึงมา
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456..."
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);