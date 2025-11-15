import React, { useRef, useCallback, useState, useEffect } from 'react';
import {
    PlayIcon, PauseIcon, ChevronLeftIcon, ChevronRightIcon,
    VolumeUpIcon, VolumeOffIcon, LoaderIcon, Cog6ToothIcon, XCircleIcon
} from './icons';
import { AudioState } from '../hooks/useAudioPlayer';

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5];

interface AudioPlayerProps {
    audioState: AudioState;
    onPlayPause: () => void;
    onSeek: (time: number) => void;
    onVolumeChange: (volume: number) => void;
    onMuteToggle: () => void;
    onSpeedChange: (speed: number) => void;
    onNext: () => void;
    onPrevious: () => void;
    isPreviousDisabled: boolean;
    isNextDisabled: boolean;
}

const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) return '00:00';
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export function AudioPlayerComponent({
    audioState,
    onPlayPause,
    onSeek,
    onVolumeChange,
    onMuteToggle,
    onSpeedChange,
    onNext,
    onPrevious,
    isPreviousDisabled,
    isNextDisabled,
}: AudioPlayerProps) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isVolumeOpen, setIsVolumeOpen] = useState(false);

    const settingsRef = useRef<HTMLDivElement>(null);
    const volumeRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLInputElement>(null);

    const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(event.target.value);
        onSeek(time);
    }, [onSeek]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
            if (volumeRef.current && !volumeRef.current.contains(event.target as Node)) {
                setIsVolumeOpen(false);
            }
        };
        
        if (isSettingsOpen || isVolumeOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isSettingsOpen, isVolumeOpen]);

     // Adiciona atalhos de teclado para o player de áudio
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignora atalhos se o foco estiver em um input, textarea, etc.
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
                return;
            }

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    onPlayPause();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    onSeek(Math.min(audioState.duration, audioState.currentTime + 5));
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    onSeek(Math.max(0, audioState.currentTime - 5));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    onVolumeChange(Math.min(1, audioState.volume + 0.1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    onVolumeChange(Math.max(0, audioState.volume - 0.1));
                    break;
                case 'KeyM':
                    e.preventDefault();
                    onMuteToggle();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onPlayPause, onSeek, onVolumeChange, onMuteToggle, audioState.currentTime, audioState.duration, audioState.volume]);

    if (audioState.status === 'idle') {
        return null;
    }

    const { status, trackInfo, currentTime, duration, volume, isMuted, speed } = audioState;

    const isPlaying = status === 'playing';
    const isLoading = status === 'loading';
    
    const getTrackDescription = () => {
        if (!trackInfo.chapterTitle) return '';
        if (trackInfo.chapterTitle.startsWith('Resumo:')) {
            return 'Ouvindo resumo do tópico';
        }
        return 'Ouvindo tópico completo';
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 z-40 p-3 shadow-lg-top">
            <div className="max-w-7xl mx-auto flex flex-col gap-2">
                {/* Progress Bar */}
                <div className="w-full flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400 w-12 text-center">{formatTime(currentTime)}</span>
                    <input
                        ref={progressBarRef}
                        type="range"
                        min="0"
                        max={duration}
                        value={currentTime}
                        onChange={handleSeek}
                        className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        aria-label="Barra de progresso do áudio"
                    />
                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400 w-12 text-center">{formatTime(duration)}</span>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-gray-800 dark:text-gray-200" title={trackInfo.chapterTitle}>
                            {trackInfo.chapterTitle || 'Carregando...'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {getTrackDescription()}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        <button onClick={onPrevious} disabled={isPreviousDisabled} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Faixa anterior">
                            <ChevronLeftIcon className="w-6 h-6" />
                        </button>
                        <button onClick={onPlayPause} disabled={isLoading} className="p-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:bg-indigo-400 disabled:cursor-wait" aria-label={isPlaying ? 'Pausar' : 'Tocar'}>
                            {isLoading ? <LoaderIcon className="w-6 h-6 animate-spin" /> : (isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />)}
                        </button>
                        <button onClick={onNext} disabled={isNextDisabled} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Próxima faixa">
                            <ChevronRightIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 flex items-center justify-end gap-2">
                        <div ref={volumeRef} className="relative">
                            <button 
                                onClick={() => setIsVolumeOpen(prev => !prev)} 
                                className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition" 
                                aria-label="Controle de volume"
                            >
                                {isMuted || volume === 0 ? <VolumeOffIcon className="w-6 h-6" /> : <VolumeUpIcon className="w-6 h-6" />}
                            </button>
                            {isVolumeOpen && (
                                <div className="absolute bottom-full right-0 mb-2 w-32 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                                    <input
                                        type="range"
                                        min="0" max="1" step="0.05"
                                        value={isMuted ? 0 : volume}
                                        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                        aria-label="Controle de volume"
                                    />
                                </div>
                            )}
                        </div>

                       <div ref={settingsRef} className="relative">
                            <button 
                                onClick={() => setIsSettingsOpen(prev => !prev)} 
                                className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition" 
                                aria-label={isSettingsOpen ? "Fechar configurações de áudio" : "Abrir configurações de áudio"}
                                aria-expanded={isSettingsOpen}
                            >
                               {isSettingsOpen ? <XCircleIcon className="w-6 h-6 text-indigo-500" /> : <Cog6ToothIcon className="w-6 h-6" />}
                            </button>
                            {isSettingsOpen && (
                                <div className="absolute bottom-full right-0 mb-2 w-40 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3">
                                    <div className="space-y-2">
                                        <label htmlFor="speed-select" className="text-xs font-semibold text-gray-600 dark:text-gray-400">Velocidade</label>
                                        <select
                                            id="speed-select"
                                            value={speed}
                                            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                                            className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-semibold rounded-md border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-none py-1 pl-2 pr-6"
                                            aria-label="Velocidade de reprodução"
                                        >
                                            {PLAYBACK_SPEEDS.map(s => (
                                                <option key={s} value={s}>{s}x</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                       </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
