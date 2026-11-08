import React from 'react'
import {createRoot} from 'react-dom/client'
import './style.css'
import App from './App'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)

// 숫자 입력칸에 커서가 있을 때 마우스 휠을 굴려 값이 몰래 바뀌지 않도록 휠을 굴리면 입력칸을 빠져나온다.
document.addEventListener(
  "wheel",
  () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "number") active.blur();
  },
  { passive: true },
);
