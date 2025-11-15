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

// O hook agora gerencia internamente o estado de configuração de áudio e sua persistência.
export function useAudioPlayer() {
    // Gerencia a configuração de áudio (voz, velocidade) e a carrega/salva no localStorage.
    const [audioConfig, setAudioConfig] = useState<AudioConfig>(() => {
        try {
            const savedConfig = localStorage.getItem('cortexAudioConfig');
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                // Validação básica para garantir que os dados do localStorage são válidos.
                if (typeof parsed.voice === 'string' && typeof parsed.speed === 'number') {
                    return parsed;
                }
            }
        } catch (e) { 
            console.error("Falha ao carregar configuração de áudio do localStorage", e);
        }
        return { voice: 'Kore', speed: 1 }; // Configuração padrão.
    });

    // Salva as configurações no localStorage sempre que elas mudam.
    useEffect(() => {
        try {
            localStorage.setItem('cortexAudioConfig', JSON.stringify(audioConfig));
        } catch (e) {
            console.error("Falha ao salvar configuração de áudio no localStorage", e);
        }
    }, [audioConfig]);

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
    
    const audioStateRef = useRef(audioState);
    useEffect(() => {
        audioStateRef.current = audioState;
    }, [audioState]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    
    const playbackStartedAtRef = useRef<number>(0);
    const playbackPausedAtRef = useRef<number>(0);
    
    const animationFrameRef = useRef<number | null>(null);
    const generationIdRef = useRef(0);
    const onEndedCallbackRef = useRef<(() => void) | null>(null);
    const updateProgressRef = useRef<() => void>();

    const stop = useCallback((resetFullState = true) => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioSourceRef.current) {
            audioSourceRef.current.onended = null;
            try {
                // FIX: The stop() method should be called with an argument to be compatible with all browser versions.
                // Passing 0 stops the playback immediately.
                audioSourceRef.current.stop(0);
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

    useEffect(() => {
        updateProgressRef.current = () => {
            const state = audioStateRef.current;
            if (state.status !== 'playing' || !audioContextRef.current || !audioBufferRef.current) {
                return;
            }
            
            const elapsed = audioContextRef.current.currentTime - playbackStartedAtRef.current;
            const newCurrentTime = playbackPausedAtRef.current + (elapsed * state.speed);
            const duration = audioBufferRef.current.duration;

            if (duration > 0 && newCurrentTime >= duration) {
                setAudioState(prev => ({ ...prev, currentTime: duration }));
                stop(true);
                if (onEndedCallbackRef.current) {
                    onEndedCallbackRef.current();
                }
            } else {
                setAudioState(prev => ({ ...prev, currentTime: newCurrentTime }));
                animationFrameRef.current = requestAnimationFrame(updateProgressRef.current!);
            }
        };
    }, [stop]);

    const play = useCallback((startTime = 0) => {
        if (!audioBufferRef.current) return;
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        if (!gainNodeRef.current || gainNodeRef.current.context.state === 'closed') {
            gainNodeRef.current = audioContextRef.current.createGain();
            gainNodeRef.current.connect(audioContextRef.current.destination);
        }
        
        stop(false);

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.playbackRate.value = audioStateRef.current.speed;
        source.connect(gainNodeRef.current);

        source.onended = () => {
            if (audioSourceRef.current === source && audioStateRef.current.status === 'playing') {
                 stop(true);
                 if (onEndedCallbackRef.current) {
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
        animationFrameRef.current = requestAnimationFrame(updateProgressRef.current!);

    }, [stop]);

    const pause = useCallback(() => {
        if (!audioContextRef.current || audioState.status !== 'playing') return;
        const elapsed = audioContextRef.current.currentTime - playbackStartedAtRef.current;
        playbackPausedAtRef.current += elapsed * audioStateRef.current.speed;
        stop(false);
        setAudioState(prev => ({...prev, status: 'paused' }));
    }, [stop, audioState.status]);

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
            const cacheKey = `${audioConfig.voice}::${text}`;
            let base64Audio = await getAudio(cacheKey);

            if (!base64Audio) {
                base64Audio = await generateSpeech(text, audioConfig.voice);
                if (currentGenerationId !== generationIdRef.current) return;
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
        if (audioSourceRef.current) {
            audioSourceRef.current.playbackRate.value = newSpeed;
        }
    }, []);
    
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
        audioConfig,
        setAudioConfig,
    };
}