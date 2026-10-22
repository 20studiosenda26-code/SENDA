import { useEffect, useState, useRef } from 'react';
import welcomeAudioFile from '../assets/welcome-jessica.mp3';

export const WelcomeAudio = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Usamos una nueva llave (v2) para ignorar el bloqueo anterior
    const hasPlayed = sessionStorage.getItem('senda_welcome_played_v2');
    if (hasPlayed === 'true') return;

    const playAudio = () => {
      if (!audioRef.current) {
        audioRef.current = new Audio(welcomeAudioFile);
        audioRef.current.volume = 0.8;
      }
      
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          sessionStorage.setItem('senda_welcome_played_v2', 'true');
          // Limpiamos los eventos para que no intente sonar dos veces
          document.removeEventListener('click', playAudio);
          document.removeEventListener('keydown', playAudio);
        })
        .catch((err) => {
          console.warn("Navegador bloqueó el autoplay. Esperando un clic para forzar reproducción:", err);
          // Si lo bloquea, no nos rendimos. Esperamos el próximo clic en cualquier parte de la pantalla.
          document.addEventListener('click', playAudio, { once: true });
          document.addEventListener('keydown', playAudio, { once: true });
        });
        
      audioRef.current.onended = () => {
        setIsPlaying(false);
      };
    };

    // Intentamos reproducir de inmediato al entrar al dashboard
    playAudio();

    return () => {
      document.removeEventListener('click', playAudio);
      document.removeEventListener('keydown', playAudio);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  if (!isPlaying) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-4 bg-[#1A1D22] border border-[#22262D] rounded-xl p-4 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end gap-1 h-5">
        <span className="w-1.5 bg-[#35D6E4] rounded-full h-full animate-[bounce_1s_infinite_100ms]"></span>
        <span className="w-1.5 bg-[#35D6E4] rounded-full h-3/5 animate-[bounce_1s_infinite_200ms]"></span>
        <span className="w-1.5 bg-[#35D6E4] rounded-full h-4/5 animate-[bounce_1s_infinite_300ms]"></span>
        <span className="w-1.5 bg-[#35D6E4] rounded-full h-2/5 animate-[bounce_1s_infinite_400ms]"></span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-spaceGrotesk font-bold text-white tracking-wide">SENDA AI</span>
        <span className="text-xs font-inter text-gray-400">Iniciando sesión...</span>
      </div>
    </div>
  );
};
