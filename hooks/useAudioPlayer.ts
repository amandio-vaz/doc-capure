import { useState, useRef, useCallback, useEffect } from 'react';
import { generateSpeech } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';
import { AudioConfig } from '../types';

type AudioState = {
    status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
    chapterIndex: number | null;
    paragraphIndex: number | null;
    errorMessage?: string;
};

type UseAudioPlayerProps = {
  audioConfig: AudioConfig;
};

export function useAudioPlayer({ audioConfig }: UseAudioPlayerProps) {
    const [audioState, setAudioState] = useState<AudioState>({ status: 'idle', chapterIndex: null, paragraphIndex: null });
    const [playbackProgress, setPlaybackProgress] = useState(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const playbackProgressRef = useRef<number>(0);
    const playbackStartTimeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);

    const stopAudio = useCallback((resetState = true) => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioSourceRef.current) {
            audioSourceRef.current.onended = null;
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (resetState) {
            setAudioState({ status: 'idle', chapterIndex: null, paragraphIndex: null });
            setPlaybackProgress(0);
            playbackProgressRef.current = 0;
            audioBufferRef.current = null;
        }
    }, []);

    const playInternal = useCallback((buffer: AudioBuffer, startTime: number, chapterIndex: number, paragraphIndex: number) => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;

        stopAudio(false);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = audioConfig.speed;
        source.connect(audioContext.destination);

        const updateProgress = () => {
            if (!audioContextRef.current || !audioBufferRef.current) return;
            const elapsedSinceStart = audioContext.currentTime - playbackStartTimeRef.current;
            const currentPosition = startTime + (elapsedSinceStart * audioConfig.speed);
            const duration = audioBufferRef.current.duration;
            const progress = Math.min(100, (currentPosition / duration) * 100);
            setPlaybackProgress(progress);
            if (progress < 100) {
                animationFrameRef.current = requestAnimationFrame(updateProgress);
            }
        };
        
        source.onended = () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            setAudioState(prev => {
                if (prev.status === 'playing' && prev.chapterIndex === chapterIndex && prev.paragraphIndex === paragraphIndex) {
                    stopAudio(true);
                    return { status: 'idle', chapterIndex: null, paragraphIndex: null };
                }
                return prev;
            });
        };

        source.start(0, startTime);
        playbackStartTimeRef.current = audioContext.currentTime;
        audioSourceRef.current = source;
        setAudioState({ status: 'playing', chapterIndex, paragraphIndex });
        animationFrameRef.current = requestAnimationFrame(updateProgress);

    }, [audioConfig.speed, stopAudio]);

    const toggleAudio = useCallback(async (text: string, chapterIndex: number, paragraphIndex: number) => {
        const isCurrentParagraphActive = audioState.chapterIndex === chapterIndex && audioState.paragraphIndex === paragraphIndex;

        if (audioState.status === 'playing' && isCurrentParagraphActive) {
            if (audioContextRef.current) {
                const elapsed = audioContextRef.current.currentTime - playbackStartTimeRef.current;
                playbackProgressRef.current += elapsed * audioConfig.speed;
            }
            stopAudio(false);
            setAudioState({ status: 'paused', chapterIndex, paragraphIndex });
            return;
        }

        if (audioState.status === 'paused' && isCurrentParagraphActive) {
            if (audioBufferRef.current) {
                playInternal(audioBufferRef.current, playbackProgressRef.current, chapterIndex, paragraphIndex);
            }
            return;
        }

        stopAudio(false);
        playbackProgressRef.current = 0;
        setPlaybackProgress(0);
        audioBufferRef.current = null;

        setAudioState({ status: 'loading', chapterIndex, paragraphIndex });
        
        try {
            if (!text) throw new Error("Conteúdo do parágrafo não encontrado.");

            const base64Audio = await generateSpeech(text, audioConfig.voice);
            
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            
            const audioContext = audioContextRef.current;
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
            
            audioBufferRef.current = audioBuffer;
            playInternal(audioBuffer, 0, chapterIndex, paragraphIndex);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Erro ao tocar áudio.";
            setAudioState({ status: 'error', chapterIndex, paragraphIndex, errorMessage });
            setTimeout(() => setAudioState({ status: 'idle', chapterIndex: null, paragraphIndex: null }), 5000);
        }
    }, [audioState, stopAudio, audioConfig.voice, playInternal]);

    useEffect(() => {
        return () => {
            stopAudio();
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, [stopAudio]);

    return {
        audioState,
        playbackProgress,
        toggleAudio,
        stopAudio,
    };
}
