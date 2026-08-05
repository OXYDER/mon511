import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Vite bloque par défaut les hôtes autres que localhost/IP (protection
    // contre le DNS rebinding). On autorise explicitement les deux domaines
    // bilingues du projet, plus les sous-domaines au cas où.
    allowedHosts: ['mon511.ca', 'www.mon511.ca', 'my511.ca', 'www.my511.ca'],
  },
});
