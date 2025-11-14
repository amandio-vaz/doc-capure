// FIX: Import React to resolve 'Cannot find namespace React' error.
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { generateSpeech } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';
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

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    
    const playbackStartedAtRef = useRef<number>(0); // When playback started/resumed (in AudioContext time)
    const playbackPausedAtRef = useRef<number>(0); // Where playback was paused (in seconds)
    
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
            } catch (e) { /* Ignore if already stopped */ }
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
        
        stop(false); // Stop any existing playback before starting a new one

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.playbackRate.value = audioState.speed;
        source.connect(gainNodeRef.current);

        const updateProgress = () => {
            if (!audioContextRef.current || audioSourceRef.current?.context.state !== 'running') return;
            
            const elapsed = audioContextRef.current.currentTime - playbackStartedAtRef.current;
            const newCurrentTime = playbackPausedAtRef.current + (elapsed * audioState.speed);
            
            setAudioState(prev => ({...prev, currentTime: newCurrentTime }));
            
            if (newCurrentTime < (audioState.duration || 0)) {
                animationFrameRef.current = requestAnimationFrame(updateProgress);
            }
        };

        source.onended = () => {
            if (audioSourceRef.current === source) {
                const wasPlaying = audioState.status === 'playing';
                const reachedEnd = Math.abs(audioState.currentTime - audioState.duration) < 0.1;
                stop(true);
                if (wasPlaying && reachedEnd && onEndedCallbackRef.current) {
                    onEndedCallbackRef.current();
                }
            }
        };
        
        gainNodeRef.current.gain.setValueAtTime(audioState.isMuted ? 0 : audioState.volume, audioContextRef.current.currentTime);
        source.start(0, startTime);
        
        playbackStartedAtRef.current = audioContextRef.current.currentTime;
        playbackPausedAtRef.current = startTime;
        audioSourceRef.current = source;
        setAudioState(prev => ({ ...prev, status: 'playing' }));
        animationFrameRef.current = requestAnimationFrame(updateProgress);

    }, [stop, audioState.speed, audioState.volume, audioState.isMuted, audioState.status, audioState.currentTime, audioState.duration]);

    const pause = useCallback(() => {
        if (!audioContextRef.current) return;
        const elapsed = audioContextRef.current.currentTime - playbackStartedAtRef.current;
        playbackPausedAtRef.current += elapsed * audioState.speed;
        stop(false);
        setAudioState(prev => ({...prev, status: 'paused' }));
    }, [stop, audioState.speed]);

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
            const base64Audio = await generateSpeech(text, audioConfig.voice);
            if (currentGenerationId !== generationIdRef.current) return;

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
            const newVolume = newMutedState ? 0 : audioState.volume;
            gainNodeRef.current.gain.setValueAtTime(newVolume, audioContextRef.current.currentTime);
        }
    }, [audioState.isMuted, audioState.volume]);

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