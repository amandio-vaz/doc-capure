import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Documentation, Chapter, AudioConfig } from './types';
import { extractDocumentation, generateSpeech } from './services/geminiService';
import { decodeAudioData, decode } from './utils/audioUtils';
import { generateAndDownloadMarkdown, generateAndDownloadHtml, generateAndPrint } from './utils/fileUtils';
import {
    SparklesIcon, LinkIcon, LoaderIcon, PlayIcon, PauseIcon,
    StopIcon, MarkdownIcon, HtmlIcon, PdfIcon, ChevronLeftIcon, ChevronRightIcon,
    SearchIcon, SunIcon, MoonIcon
} from './components/icons';

declare const showdown: any;

type AudioState = {
    status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
    chapterIndex: number | null;
    paragraphIndex: number | null;
    errorMessage?: string;
}

type Theme = 'light' | 'dark';

const AVAILABLE_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];
const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5];

export default function App() {
    const [url, setUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [doc, setDoc] = useState<Documentation | null>(null);
    const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
    const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number>(0);
    const [audioState, setAudioState] = useState<AudioState>({ status: 'idle', chapterIndex: null, paragraphIndex: null });
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [playbackProgress, setPlaybackProgress] = useState(0);

    const converter = useRef(new showdown.Converter({
        ghCompatibleHeaderId: true,
        simpleLineBreaks: true,
        tables: true
    })).current;

    const [theme, setTheme] = useState<Theme>(() => {
        const savedTheme = localStorage.getItem('theme') as Theme | null;
        if (savedTheme) return savedTheme;
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    });

    const [audioConfig, setAudioConfig] = useState<AudioConfig>(() => {
        try {
            const savedConfig = localStorage.getItem('audioConfig');
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                if (AVAILABLE_VOICES.includes(parsed.voice) && PLAYBACK_SPEEDS.includes(parsed.speed)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error("Falha ao analisar a configuração de áudio do localStorage", e);
        }
        return { voice: 'Kore', speed: 1 };
    });

    const paragraphs = useMemo(() => {
        if (!doc || !doc.chapters[selectedChapterIndex]) return [];
        return doc.chapters[selectedChapterIndex].content
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }, [doc, selectedChapterIndex]);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove(theme === 'dark' ? 'light' : 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        try {
            localStorage.setItem('audioConfig', JSON.stringify(audioConfig));
        } catch (e) {
            console.error("Falha ao salvar a configuração de áudio no localStorage", e);
        }
    }, [audioConfig]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const playbackProgressRef = useRef<number>(0);
    const playbackStartTimeRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);
    const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);

    const stopCurrentAudio = useCallback((resetState = true) => {
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
        }
    }, []);

    useEffect(() => {
        setCurrentParagraphIndex(0);
        setPlaybackProgress(0);
        stopCurrentAudio();
    }, [selectedChapterIndex, stopCurrentAudio]);

    useEffect(() => {
        paragraphRefs.current[currentParagraphIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
    }, [currentParagraphIndex, paragraphs]);

    const playAudio = useCallback((buffer: AudioBuffer, startTime: number, chapterIndex: number, paragraphIndex: number) => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;

        stopCurrentAudio(false);

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
                    playbackProgressRef.current = 0;
                    audioBufferRef.current = null;
                    setPlaybackProgress(0);
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
    }, [audioConfig.speed, stopCurrentAudio]);

    const handleAudioToggle = useCallback(async (chapterIndex: number, paragraphIndex: number) => {
        const isCurrentParagraphActive = audioState.chapterIndex === chapterIndex && audioState.paragraphIndex === paragraphIndex;

        if (audioState.status === 'playing' && isCurrentParagraphActive) {
            if (audioContextRef.current) {
                const elapsed = audioContextRef.current.currentTime - playbackStartTimeRef.current;
                playbackProgressRef.current += elapsed * audioConfig.speed;
            }
            stopCurrentAudio(false);
            setAudioState({ status: 'paused', chapterIndex, paragraphIndex });
            return;
        }

        if (audioState.status === 'paused' && isCurrentParagraphActive) {
            if (audioBufferRef.current) {
                playAudio(audioBufferRef.current, playbackProgressRef.current, chapterIndex, paragraphIndex);
            }
            return;
        }

        stopCurrentAudio(false);
        playbackProgressRef.current = 0;
        setPlaybackProgress(0);
        audioBufferRef.current = null;

        setAudioState({ status: 'loading', chapterIndex, paragraphIndex });
        
        try {
            const paragraphContent = paragraphs[paragraphIndex];
            if (!paragraphContent) throw new Error("Conteúdo do parágrafo não encontrado.");

            const base64Audio = await generateSpeech(paragraphContent, audioConfig.voice);
            
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            
            const audioContext = audioContextRef.current;
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
            
            audioBufferRef.current = audioBuffer;
            playAudio(audioBuffer, 0, chapterIndex, paragraphIndex);

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Erro ao tocar áudio.";
            setAudioState({ status: 'error', chapterIndex, paragraphIndex, errorMessage });
            setTimeout(() => setAudioState({ status: 'idle', chapterIndex: null, paragraphIndex: null }), 5000);
        }

    }, [paragraphs, audioState, stopCurrentAudio, audioConfig, playAudio]);

    const handleNavigateParagraph = (direction: 'next' | 'prev') => {
        const newIndex = direction === 'next' ? currentParagraphIndex + 1 : currentParagraphIndex - 1;

        if (newIndex >= 0 && newIndex < paragraphs.length) {
            setCurrentParagraphIndex(newIndex);
            if (audioState.status === 'playing') {
                handleAudioToggle(selectedChapterIndex, newIndex);
            }
        }
    };
    
    const handleProcessUrl = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!url.trim()) {
            setError("Por favor, insira uma URL válida.");
            return;
        }
    
        setIsLoading(true);
        setError(null);
        setDoc(null);
    
        try {
            const documentation = await extractDocumentation(url);
            setDoc(documentation);
            setSelectedChapterIndex(0);
            setCurrentParagraphIndex(0);
            setSearchQuery('');
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Ocorreu um erro desconhecido.";
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleDownload = (format: 'md' | 'html' | 'pdf') => {
        if (!doc) return;
        if (format === 'md') generateAndDownloadMarkdown(doc);
        if (format === 'html') generateAndDownloadHtml(doc);
        if (format === 'pdf') generateAndPrint(doc);
    };

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
    };

    const filteredChapters = doc?.chapters.filter(chapter =>
        chapter.title.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    const renderAudioButtonContent = () => {
        const isCurrentParagraphActive = audioState.chapterIndex === selectedChapterIndex && audioState.paragraphIndex === currentParagraphIndex;
    
        if (isCurrentParagraphActive && audioState.status === 'loading') {
            return <><LoaderIcon className="w-5 h-5 animate-spin" /><span>Gerando...</span></>;
        }
        if (isCurrentParagraphActive && audioState.status === 'playing') {
            return <><PauseIcon className="w-5 h-5" /><span>Pausar Áudio</span></>;
        }
        if (isCurrentParagraphActive && audioState.status === 'paused') {
            return <><PlayIcon className="w-5 h-5" /><span>Continuar</span></>;
        }
        
        return <><PlayIcon className="w-5 h-5" /><span>Ouvir Parágrafo</span></>;
    }
    
    const Header = () => (
        <header className="relative text-center p-6 border-b border-gray-200 dark:border-gray-700">
             <button
                onClick={toggleTheme}
                className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                aria-label="Alternar tema"
            >
                {theme === 'dark' ? <SunIcon className="w-6 h-6 text-yellow-300" /> : <MoonIcon className="w-6 h-6 text-gray-700" />}
            </button>
            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-600 flex items-center justify-center gap-3">
                <SparklesIcon className="w-10 h-10" />
                AleisterCrawlerDocs
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg">Transforme documentações em conteúdo estruturado e audível.</p>
        </header>
    );

    const UrlForm = () => (
        <div className="w-full max-w-2xl mx-auto mt-10 px-4">
            <form onSubmit={handleProcessUrl} className="flex flex-col sm:flex-row items-center gap-3 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="relative w-full">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-400" />
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="Cole a URL da documentação aqui..."
                        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md pl-10 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white font-semibold px-6 py-3 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition duration-300 shadow-md">
                    {isLoading ? <LoaderIcon className="animate-spin w-5 h-5" /> : <SparklesIcon className="w-5 h-5" />}
                    <span>{isLoading ? 'Processando...' : 'Processar'}</span>
                </button>
            </form>
        </div>
    );

    return (
        <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 min-h-screen">
            <Header />
            <main className="p-4 md:p-8">
                {!doc && <UrlForm />}
                {isLoading && (
                    <div className="text-center mt-12 flex flex-col items-center">
                        <LoaderIcon className="w-12 h-12 animate-spin text-indigo-500" />
                        <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">Analisando e estruturando a documentação... Isso pode levar um momento.</p>
                    </div>
                )}
                {error && <div className="text-center mt-8 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 p-4 rounded-md max-w-2xl mx-auto border border-red-300 dark:border-red-700">{error}</div>}
                
                {doc && (
                    <div className="max-w-7xl mx-auto mt-6">
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center md:text-left">{doc.title}</h2>
                            <div className="flex items-center gap-3 flex-wrap justify-center md:justify-end">
                                <button onClick={() => handleDownload('md')} className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm px-3 py-2 rounded-md transition" title="Baixar arquivo no formato Markdown">
                                    <MarkdownIcon className="w-5 h-5" /> Markdown
                                </button>
                                <button onClick={() => handleDownload('html')} className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm px-3 py-2 rounded-md transition" title="Baixar arquivo no formato HTML">
                                    <HtmlIcon className="w-5 h-5" /> HTML
                                </button>
                                <button onClick={() => handleDownload('pdf')} className="flex items-center gap-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm px-3 py-2 rounded-md transition" title="Gera uma versão para impressão que pode ser salva como PDF">
                                    <PdfIcon className="w-5 h-5" /> Exportar para PDF
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            <aside className="lg:col-span-4 xl:col-span-3">
                                <div className="sticky top-8 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                    <h3 className="text-xl font-semibold mb-4 border-b border-gray-300 dark:border-gray-600 pb-2">Capítulos</h3>
                                    <div className="relative mb-4">
                                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Buscar capítulos..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md pl-10 pr-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                                        />
                                    </div>
                                    <ul className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                                        {filteredChapters.length > 0 ? (
                                            filteredChapters.map((chapter) => {
                                                const originalIndex = doc.chapters.indexOf(chapter);
                                                return (
                                                <li key={originalIndex}>
                                                    <button onClick={() => setSelectedChapterIndex(originalIndex)} className={`w-full text-left p-3 rounded-md text-sm transition ${selectedChapterIndex === originalIndex ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                                        {chapter.title}
                                                    </button>
                                                </li>
                                            )})
                                        ) : (
                                            <li className="text-gray-500 dark:text-gray-400 text-center p-4 text-sm">Nenhum capítulo encontrado.</li>
                                        )}
                                    </ul>
                                </div>
                            </aside>
                            <article className="lg:col-span-8 xl:col-span-9 bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 min-h-[70vh]">
                                {doc.chapters[selectedChapterIndex] && (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                                            <h3 className="text-2xl font-bold text-indigo-500 dark:text-indigo-400 mb-4">{doc.chapters[selectedChapterIndex].title}</h3>
                                            
                                            {paragraphs.length > 1 && (
                                                <div className="flex items-center justify-between gap-4 mb-4 bg-gray-100 dark:bg-gray-900 p-2 rounded-lg">
                                                    <button 
                                                        onClick={() => handleNavigateParagraph('prev')}
                                                        disabled={currentParagraphIndex === 0}
                                                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                                                    >
                                                        <ChevronLeftIcon className="w-4 h-4"/>
                                                        <span>Anterior</span>
                                                    </button>
                                                    <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                                                        Parágrafo {currentParagraphIndex + 1} / {paragraphs.length}
                                                    </span>
                                                    <button 
                                                        onClick={() => handleNavigateParagraph('next')}
                                                        disabled={currentParagraphIndex === paragraphs.length - 1}
                                                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                                                    >
                                                        <span>Próximo</span>
                                                        <ChevronRightIcon className="w-4 h-4"/>
                                                    </button>
                                                </div>
                                            )}

                                            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                <button 
                                                  onClick={() => handleAudioToggle(selectedChapterIndex, currentParagraphIndex)} 
                                                  disabled={audioState.status === 'loading'}
                                                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold transition disabled:bg-purple-400 disabled:cursor-wait order-1 md:order-none w-[200px]"
                                                >
                                                   {renderAudioButtonContent()}
                                                </button>
                                                
                                                <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 order-2 md:order-none">
                                                    <div className="flex items-center gap-2">
                                                        <label htmlFor="voice-select" className="text-sm font-medium text-gray-500 dark:text-gray-400">Voz:</label>
                                                        <select
                                                            id="voice-select"
                                                            value={audioConfig.voice}
                                                            onChange={(e) => setAudioConfig(prev => ({ ...prev, voice: e.target.value }))}
                                                            className="bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-1.5"
                                                        >
                                                            {AVAILABLE_VOICES.map(voice => (
                                                                <option key={voice} value={voice}>{voice}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Velocidade:</span>
                                                        <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-lg border border-gray-300 dark:border-gray-600">
                                                            {PLAYBACK_SPEEDS.map(speed => (
                                                                <button
                                                                    key={speed}
                                                                    onClick={() => setAudioConfig(prev => ({ ...prev, speed }))}
                                                                    className={`px-3 py-1 text-sm transition first:rounded-l-md last:rounded-r-md ${
                                                                        audioConfig.speed === speed
                                                                        ? 'bg-purple-600 text-white font-semibold'
                                                                        : 'hover:bg-gray-300 dark:hover:bg-gray-600'
                                                                    }`}
                                                                >
                                                                    {speed}x
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {(audioState.status === 'playing' || audioState.status === 'paused') && audioState.chapterIndex === selectedChapterIndex && (
                                                <div className="mt-4 w-full">
                                                    <div className="bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                                        <div 
                                                            className="bg-purple-600 h-2 rounded-full transition-all duration-100" 
                                                            style={{ width: `${playbackProgress}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {audioState.status === 'error' && audioState.chapterIndex === selectedChapterIndex && <div className="mb-4 p-2 text-sm bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded border border-red-300 dark:border-red-700">{audioState.errorMessage}</div>}
                                        
                                        <div className={`prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:rounded-md prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-600 prose-img:rounded-md`}>
                                            {paragraphs.map((p, index) => (
                                                <div
                                                    key={index}
                                                    // FIX: The ref callback should not return a value. Wrapped in curly braces to ensure a void return type.
                                                    ref={el => { paragraphRefs.current[index] = el; }}
                                                    className={`transition-all duration-300 rounded-lg p-3 -m-3 ${
                                                        index === currentParagraphIndex
                                                            ? 'bg-indigo-50 dark:bg-gray-700/50 ring-2 ring-indigo-200 dark:ring-indigo-700'
                                                            : ''
                                                    }`}
                                                    dangerouslySetInnerHTML={{ __html: converter.makeHtml(p) }}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </article>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
