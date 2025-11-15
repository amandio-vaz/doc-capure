// FIX: Import React to resolve 'Cannot find namespace React' error.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { generateSpeech } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';
import { getAudio, storeAudio } from '../utils/db';
import { AudioConfig } from '../types';

type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type AudioState = {
    status: AudioStatus;
    trackInfo: {
        chapterIndex: number | null;
        paragraphIndex: number | null;
        chapterTitle?: string;
        paragraphContent?: string;
    },
    currentTime: number;
    duration: number;
    volume: number;
    isMuted: boolean;
    speed: number;
    errorMessage?: string;
};

type UseAudioPlayerProps = {
  audioConfig: AudioConfig;
  setAudioConfig: React.Dispatch<React.SetStateAction<AudioConfig>>;
};

export function useAudioPlayer({ audioConfig, setAudioConfig }: UseAudioPlayerProps) {
    const [audioState, setAudioState] = useState<AudioState>({
        status: 'idle',
        trackInfo: { chapterIndex: null, paragraphIndex: null },
        currentTime: 0,
        duration: 0,
        volume: 1,
        isMuted: false,
        speed: audioConfig.speed,
        errorMessage: undefined,
    });
    
    // Usa uma ref para manter a versão mais recente do estado,
    // permitindo que callbacks (play, pause) acessem o estado atualizado sem precisar dele em suas dependências.
    const audioStateRef = useRef(audioState);
    useEffect(() => {
        audioStateRef.current = audioState;
    }, [audioState]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    
    const playbackStartedAtRef = useRef<number>(0); // Quando a reprodução começou/retomou (no tempo do AudioContext)
    const playbackPausedAtRef = useRef<number>(0); // Onde a reprodução foi pausada (em segundos)
    
    const animationFrameRef = useRef<number | null>(null);
    const generationIdRef = useRef(0);
    const onEndedCallbackRef = useRef<(() => void) | null>(null);

    const stop = useCallback((resetFullState = true) => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioSourceRef.current) {
            audioSourceRef.current.onended = null;
            try {
                audioSourceRef.current.stop();
            } catch (e) { /* Ignora se já parado */ }
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (resetFullState) {
            setAudioState(prev => ({ ...prev, status: 'idle', trackInfo: { chapterIndex: null, paragraphIndex: null }, currentTime: 0, duration: 0 }));
            audioBufferRef.current = null;
            playbackPausedAtRef.current = 0;
        }
    }, []);

    const play = useCallback((startTime = 0) => {
        if (!audioBufferRef.current) return;
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        if (!gainNodeRef.current || gainNodeRef.current.context.state === 'closed') {
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
        }
        
        stop(false); // Para qualquer reprodução existente antes de iniciar uma nova

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.playbackRate.value = audioStateRef.current.speed;
        source.connect(gainNodeRef.current);

        const updateProgress = () => {
            if (!audioContextRef.current || audioSourceRef.current?.context.state !== 'running') return;
            
            const elapsed = audioContextRef.current.currentTime - playbackStartedAtRef.current;
            const newCurrentTime = playbackPausedAtRef.current + (elapsed * audioStateRef.current.speed);
            
            setAudioState(prev => ({...prev, currentTime: newCurrentTime }));
            
            if (newCurrentTime < (audioStateRef.current.duration || 0)) {
                animationFrameRef.current = requestAnimationFrame(updateProgress);
            }
        };

        source.onended = () => {
            if (audioSourceRef.current === source) {
                const currentState = audioStateRef.current;
                const wasPlaying = currentState.status === 'playing';
                const reachedEnd = Math.abs(currentState.currentTime - currentState.duration) < 0.1;
                stop(true);
                if (wasPlaying && reachedEnd && onEndedCallbackRef.current) {
                    onEndedCallbackRef.current();
                }
            }
        };
        
        gainNodeRef.current.gain.setValueAtTime(audioStateRef.current.isMuted ? 0 : audioStateRef.current.volume, audioContextRef.current.currentTime);
        source.start(0, startTime);
        
        playbackStartedAtRef.current = audioContextRef.current.currentTime;
        playbackPausedAtRef.current = startTime;
        audioSourceRef.current = source;
        setAudioState(prev => ({ ...prev, status: 'playing' }));
        animationFrameRef.current = requestAnimationFrame(updateProgress);

    }, [stop]);

    const pause = useCallback(() => {
        if (!audioContextRef.current) return;
        const elapsed = audioContextRef.current.currentTime - playbackStartedAtRef.current;
        playbackPausedAtRef.current += elapsed * audioStateRef.current.speed;
        stop(false);
        setAudioState(prev => ({...prev, status: 'paused' }));
    }, [stop]);

    const playPause = useCallback(() => {
        if (audioState.status === 'playing') {
            pause();
        } else if (audioState.status === 'paused') {
            play(playbackPausedAtRef.current);
        }
    }, [audioState.status, pause, play]);

    const loadAndPlay = useCallback(async (text: string, chapterIndex: number, paragraphIndex: number, onEnded: () => void, chapterTitle: string) => {
        onEndedCallbackRef.current = onEnded;
        const currentGenerationId = ++generationIdRef.current;
        
        stop(true);
        setAudioState(prev => ({ ...prev, status: 'loading', trackInfo: { chapterIndex, paragraphIndex, chapterTitle, paragraphContent: text } }));

        try {
            // Cria uma chave única para o cache baseada na voz e no conteúdo.
            const cacheKey = `${audioConfig.voice}::${text}`;
            let base64Audio = await getAudio(cacheKey);

            if (!base64Audio) {
                // Se não estiver no cache, gera o áudio via API.
                base64Audio = await generateSpeech(text, audioConfig.voice);
                if (currentGenerationId !== generationIdRef.current) return;
                
                // Armazena o novo áudio no cache para uso futuro.
                // Faz isso de forma assíncrona para não bloquear a reprodução.
                storeAudio(cacheKey, base64Audio).catch(console.error);
            }

            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            const buffer = await decodeAudioData(decode(base64Audio), audioContextRef.current, 24000, 1);
            if (currentGenerationId !== generationIdRef.current) return;

            audioBufferRef.current = buffer;
            setAudioState(prev => ({ ...prev, duration: buffer.duration }));
            play(0);

        } catch (err) {
            if (currentGenerationId === generationIdRef.current) {
                const message = err instanceof Error ? err.message : "Erro ao carregar áudio.";
                setAudioState(prev => ({ ...prev, status: 'error', errorMessage: message }));
            }
        }
    }, [stop, audioConfig.voice, play]);

    const seekTo = useCallback((time: number) => {
        if (audioBufferRef.current) {
            const wasPlaying = audioState.status === 'playing';
            playbackPausedAtRef.current = time;
            setAudioState(prev => ({ ...prev, currentTime: time }));
            if (wasPlaying) {
                play(time);
            }
        }
    }, [audioState.status, play]);

    const handleVolumeChange = useCallback((newVolume: number) => {
        setAudioState(prev => ({ ...prev, volume: newVolume, isMuted: newVolume === 0 }));
        if (gainNodeRef.current && audioContextRef.current) {
            gainNodeRef.current.gain.setValueAtTime(newVolume, audioContextRef.current.currentTime);
        }
    }, []);

    const handleMuteToggle = useCallback(() => {
        const newMutedState = !audioState.isMuted;
        setAudioState(prev => ({ ...prev, isMuted: newMutedState }));
        if (gainNodeRef.current && audioContextRef.current) {
            const newVolume = newMutedState ? 0 : audioStateRef.current.volume;
            gainNodeRef.current.gain.setValueAtTime(newVolume, audioContextRef.current.currentTime);
        }
    }, [audioState.isMuted]);

    const handleSpeedChange = useCallback((newSpeed: number) => {
        setAudioConfig(prev => ({ ...prev, speed: newSpeed }));
        setAudioState(prev => ({ ...prev, speed: newSpeed }));
        if (audioSourceRef.current) {
            audioSourceRef.current.playbackRate.value = newSpeed;
        }
    }, [setAudioConfig]);
    
    useEffect(() => {
      setAudioState(prev => ({...prev, speed: audioConfig.speed}));
    }, [audioConfig.speed])

    useEffect(() => {
        return () => {
            stop(true);
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(console.error);
            }
        };
    }, [stop]);

    return {
        audioState,
        loadAndPlay,
        playPause,
        stopAudio: stop,
        seekTo,
        handleVolumeChange,
        handleMuteToggle,
        handleSpeedChange,
    };
}