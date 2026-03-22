import React from 'react';
import ReactDOM from 'react-dom/client';
import BoardGame from './src/app.jsx'; // ดึง Component มาจากไฟล์ App.jsx

// สร้าง Root และสั่ง Render ตัว BoardGame ลงไปใน <div id="root">
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BoardGame />
  </React.StrictMode>
);