import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ command }) => ({
  // Q1: project Pages site — https://2aimoliu.github.io/peerjs-practice/
  base: '/peerjs-practice/',
  plugins: [
    solid(),
    tailwindcss(),
    // Q5: HTTPS on LAN so a real phone can open the camera in dev.
    ...(command === 'serve' ? [basicSsl()] : []),
  ],
  server: { host: true },
}))
