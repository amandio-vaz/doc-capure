import React, { useRef, useCallback } from 'react';
import {
    PlayIcon, PauseIcon, StopIcon, ChevronLeftIcon, ChevronRightIcon,
    VolumeUpIcon, VolumeOffIcon, LoaderIcon
} from './icons';
import { AudioState } from '../hooks/useAudioPlayer';

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5];

interface AudioPlayerProps {
    audioState: AudioState;
    onPlayPause: () => void;
    onStop: () => void;
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
    onStop,
    onSeek,
    onVolumeChange,
    onMuteToggle,
    onSpeedChange,
    onNext,
    onPrevious,
    isPreviousDisabled,
    isNextDisabled,
}: AudioPlayerProps) {
    const progressBarRef = useRef<HTMLInputElement>(null);

    const handleSeek = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(event.target.value);
        onSeek(time);
    }, [onSeek]);

    if (audioState.status === 'idle') {
        return null;
    }

    const { status, trackInfo, currentTime, duration, volume, isMuted, speed } = audioState;

    const isPlaying = status === 'playing';
    const isLoading = status === 'loading';
    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    
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
                        <button onClick={onStop} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition" aria-label="Parar">
                            <StopIcon className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 flex items-center justify-end gap-3">
                        <div className="flex items-center gap-2 w-32">
                            <button onClick={onMuteToggle} className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white" aria-label={isMuted ? 'Ativar som' : 'Silenciar'}>
                                {isMuted || volume === 0 ? <VolumeOffIcon className="w-5 h-5" /> : <VolumeUpIcon className="w-5 h-5" />}
                            </button>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={isMuted ? 0 : volume}
                                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                aria-label="Controle de volume"
                            />
                        </div>
                        <select
                            value={speed}
                            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                            className="bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-xs font-semibold rounded-md border-transparent focus:ring-2 focus:ring-indigo-500 focus:outline-none py-1 pl-2 pr-6"
                            aria-label="Velocidade de reprodução"
                        >
                            {PLAYBACK_SPEEDS.map(s => (
                                <option key={s} value={s}>{s}x</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}