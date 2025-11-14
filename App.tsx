import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Documentation, Chapter, AudioConfig } from './types';
import { extractDocumentation, generateChapterSummary } from './services/geminiService';
import { generateAndDownloadMarkdown, generateAndDownloadHtml, generateAndPrint, downloadAsFile, generateAndPrintChapter } from './utils/fileUtils';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { AudioPlayerComponent } from './components/AudioPlayer';
import {
    SparklesIcon, LinkIcon, LoaderIcon, PlayIcon,
    StopIcon, MarkdownIcon, HtmlIcon, PdfIcon, ChevronLeftIcon, ChevronRightIcon,
    SearchIcon, SunIcon, MoonIcon, CopyIcon, CheckIcon, DocumentTextIcon,
    ArrowsPointingOutIcon, ArrowsPointingInIcon, AudioIcon, ReplyIcon
} from './components/icons';

declare const showdown: any;

type Theme = 'light' | 'dark';
type CopyStatus = 'idle' | 'copied';

const AVAILABLE_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

interface FlattenedChapter {
    chapter: Chapter;
    level: number;
    parentIndex: number | null;
    originalIndex: number;
}

export default function App() {
    const [url, setUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [doc, setDoc] = useState<Documentation | null>(null);
    const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
    const [currentParagraphIndex, setCurrentParagraphIndex] = useState<number>(0);
    const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>(() => {
        return localStorage.getItem('chapterSearchQuery') || '';
    });
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
    const [chapterCopyStatus, setChapterCopyStatus] = useState<CopyStatus>('idle');
    const [audioSummaryState, setAudioSummaryState] = useState({ isLoading: false, error: null as string | null });

    const [summaryState, setSummaryState] = useState<{
        isLoading: boolean;
        error: string | null;
        content: string | null;
        chapterTitle: string | null;
        isModalOpen: boolean;
        chapterIndex: number | null;
        summaryCopyStatus: 'idle' | 'copied';
    }>({
        isLoading: false,
        error: null,
        content: null,
        chapterTitle: null,
        isModalOpen: false,
        chapterIndex: null,
        summaryCopyStatus: 'idle',
    });
    const [chapterPlaybackState, setChapterPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');


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
                if (AVAILABLE_VOICES.includes(parsed.voice)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error("Falha ao analisar a configuração de áudio do localStorage", e);
        }
        return { voice: 'Kore', speed: 1 };
    });

    const flattenedChapters = useMemo((): FlattenedChapter[] => {
        if (!doc) return [];

        const flatten = (chapters: Chapter[], level: number, parentIdx: number | null, result: Omit<FlattenedChapter, 'originalIndex'>[] = []): Omit<FlattenedChapter, 'originalIndex'>[] => {
            chapters.forEach(ch => {
                const currentIndex = result.length;
                result.push({ chapter: ch, level, parentIndex: parentIdx });
                if (ch.subChapters && ch.subChapters.length > 0) {
                    flatten(ch.subChapters, level + 1, currentIndex, result);
                }
            });
            return result;
        };

        return flatten(doc.chapters, 0, null).map((item, index) => ({
            ...item,
            originalIndex: index,
        }));
    }, [doc]);

    const paragraphs = useMemo(() => {
        if (!flattenedChapters[selectedChapterIndex]) return [];
        return flattenedChapters[selectedChapterIndex].chapter.content
            .split(/\n\s*\n/)
            .map(p => p.trim())
            .filter(p => p.length > 0);
    }, [flattenedChapters, selectedChapterIndex]);

    const {
        audioState, loadAndPlay, playPause, stopAudio, seekTo,
        handleVolumeChange, handleMuteToggle, handleSpeedChange
    } = useAudioPlayer({ audioConfig, setAudioConfig });

    const handleStopChapterPlayback = useCallback(() => {
        setChapterPlaybackState('idle');
        stopAudio();
    }, [stopAudio]);

    const handleParagraphPlay = useCallback(async (chapterIndex: number, paragraphIndex: number, onEndedCallback?: () => void) => {
        handleStopChapterPlayback();
        const paragraphContent = paragraphs[paragraphIndex];
        const chapterTitle = flattenedChapters[chapterIndex]?.chapter.title || '';
        if (paragraphContent) {
            loadAndPlay(paragraphContent, chapterIndex, paragraphIndex, onEndedCallback as () => void, chapterTitle);
        }
    }, [paragraphs, flattenedChapters, loadAndPlay, handleStopChapterPlayback]);

    const playNextParagraph = useCallback(() => {
        const nextIndex = currentParagraphIndex + 1;
        if (nextIndex < paragraphs.length) {
            setCurrentParagraphIndex(nextIndex);
            handleParagraphPlay(selectedChapterIndex, nextIndex, playNextParagraph);
        } else {
            setChapterPlaybackState('idle');
        }
    }, [currentParagraphIndex, paragraphs, selectedChapterIndex, handleParagraphPlay]);

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove(theme === 'dark' ? 'light' : 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const handleNavigateParagraph = useCallback((direction: 'next' | 'prev') => {
        const newIndex = direction === 'next' ? currentParagraphIndex + 1 : currentParagraphIndex - 1;

        if (newIndex >= 0 && newIndex < paragraphs.length) {
            const isAudioActive = audioState.status === 'playing' || audioState.status === 'loading';
            
            setCurrentParagraphIndex(newIndex);
            
            if (isAudioActive) {
                handleParagraphPlay(selectedChapterIndex, newIndex);
            } else {
                handleStopChapterPlayback();
            }
        }
    }, [currentParagraphIndex, paragraphs.length, audioState.status, selectedChapterIndex, handleParagraphPlay, handleStopChapterPlayback]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
                return;
            }
    
            if (!doc) {
                return;
            }
    
            switch (event.key) {
                case 'Escape':
                    if (isFocusMode) {
                        setIsFocusMode(false);
                    }
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    handleNavigateParagraph('prev');
                    break;
                case 'ArrowDown':
                    event.preventDefault();
                    handleNavigateParagraph('next');
                    break;
                case ' ':
                    event.preventDefault();
                    if(audioState.status === 'idle' || audioState.status === 'error') {
                        handleParagraphPlay(selectedChapterIndex, currentParagraphIndex);
                    } else {
                        playPause();
                    }
                    break;
                default:
                    break;
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [doc, isFocusMode, selectedChapterIndex, currentParagraphIndex, handleNavigateParagraph, handleParagraphPlay, audioState.status, playPause]);

    useEffect(() => {
        try {
            localStorage.setItem('audioConfig', JSON.stringify(audioConfig));
        } catch (e) {
            console.error("Falha ao salvar a configuração de áudio no localStorage", e);
        }
    }, [audioConfig]);

    useEffect(() => {
        localStorage.setItem('chapterSearchQuery', searchQuery);
    }, [searchQuery]);

    const paragraphRefs = useRef<(HTMLDivElement | null)[]>([]);
    const autoPlayOnChapterChangeRef = useRef(false);

    const handleChapterPlaybackToggle = () => {
        if (audioSummaryState.isLoading) return;
    
        if (chapterPlaybackState === 'playing') {
            setChapterPlaybackState('paused');
            playPause();
        } else {
            stopAudio();
            setChapterPlaybackState('playing');
            const startIndex = chapterPlaybackState === 'paused' ? currentParagraphIndex : 0;
            if (startIndex === 0 && currentParagraphIndex !== 0) setCurrentParagraphIndex(0);
    
            if (paragraphs[startIndex]) {
                handleParagraphPlay(selectedChapterIndex, startIndex, playNextParagraph);
            }
        }
    };
    
    useEffect(() => {
        stopAudio();
        handleStopChapterPlayback();
        setCurrentParagraphIndex(0);
        
        if (autoPlayOnChapterChangeRef.current) {
            if(paragraphs[0]) {
                setChapterPlaybackState('playing');
                handleParagraphPlay(selectedChapterIndex, 0, playNextParagraph);
            }
            autoPlayOnChapterChangeRef.current = false;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChapterIndex]);

    useEffect(() => {
        paragraphRefs.current[currentParagraphIndex]?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
        });
    }, [currentParagraphIndex, paragraphs]);
    
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

    const handleCopyToClipboard = () => {
        if (!doc) return;
        const markdownContent = `# ${doc.title}\n\n` +
            doc.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.content}`).join('\n\n---\n\n');
        
        navigator.clipboard.writeText(markdownContent).then(() => {
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }).catch(err => {
            console.error('Falha ao copiar texto: ', err);
        });
    };

    const toggleTheme = () => {
        setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
    };

    const handleChapterSelect = (index: number) => {
        if (chapterPlaybackState === 'playing' || chapterPlaybackState === 'paused') {
            autoPlayOnChapterChangeRef.current = true;
        } else if (audioState.status === 'playing' || audioState.status === 'paused') {
            autoPlayOnChapterChangeRef.current = true;
        }
        setSelectedChapterIndex(index);
    };

    const handleGenerateSummary = async (chapterIndex: number) => {
        if (!doc || !flattenedChapters[chapterIndex]) return;

        const { chapter } = flattenedChapters[chapterIndex];
        
        setSummaryState({
            isLoading: true,
            error: null,
            content: null,
            chapterTitle: chapter.title,
            isModalOpen: true,
            chapterIndex: chapterIndex,
            summaryCopyStatus: 'idle',
        });

        try {
            const summary = await generateChapterSummary(chapter.title, chapter.content);
            setSummaryState(prev => ({ ...prev, content: summary, isLoading: false }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Ocorreu um erro desconhecido ao gerar o resumo.";
            setSummaryState(prev => ({ ...prev, error: errorMessage, isLoading: false }));
        }
    };

    const handleCopySummary = () => {
        if (!summaryState.content) return;
        navigator.clipboard.writeText(summaryState.content).then(() => {
            setSummaryState(prev => ({ ...prev, summaryCopyStatus: 'copied' }));
            setTimeout(() => {
                setSummaryState(prev => {
                    if (prev.isModalOpen) {
                        return { ...prev, summaryCopyStatus: 'idle' };
                    }
                    return prev;
                });
            }, 2000);
        }).catch(err => {
            console.error('Falha ao copiar o resumo: ', err);
        });
    };

    const handleExportSummary = () => {
        if (!summaryState.content || !summaryState.chapterTitle) return;
        const filename = `resumo_${summaryState.chapterTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
        downloadAsFile(summaryState.content, filename, 'text/plain;charset=utf-8');
    };

    const handleGoToChapterFromSummary = () => {
        if (summaryState.chapterIndex !== null) {
            handleChapterSelect(summaryState.chapterIndex);
            setSummaryState(prev => ({ ...prev, isModalOpen: false }));
        }
    };
    
    const handleGenerateAudioSummary = async () => {
        if (!doc || audioSummaryState.isLoading || chapterPlaybackState !== 'idle' || !flattenedChapters[selectedChapterIndex]) return;
    
        handleStopChapterPlayback(); 
        setAudioSummaryState({ isLoading: true, error: null });
    
        try {
            const { chapter } = flattenedChapters[selectedChapterIndex];
            const summary = await generateChapterSummary(chapter.title, chapter.content);
            await loadAndPlay(summary, selectedChapterIndex, -1, () => {}, chapter.title);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao gerar o resumo em áudio.";
            setAudioSummaryState({ isLoading: false, error: errorMessage });
        } finally {
            setAudioSummaryState(prev => ({ ...prev, isLoading: false }));
        }
    };

    const searchResults = useMemo(() => {
        if (!doc || !searchQuery) return [];
        const lowerCaseQuery = searchQuery.toLowerCase();
        
        return flattenedChapters
            .filter(fc => fc.chapter.title.toLowerCase().includes(lowerCaseQuery))
            .map(fc => fc.originalIndex);
    }, [doc, searchQuery, flattenedChapters]);

    const renderAudioButtonContent = () => {
        const isCurrentParagraphActive = audioState.trackInfo.chapterIndex === selectedChapterIndex && audioState.trackInfo.paragraphIndex === currentParagraphIndex;
    
        if (isCurrentParagraphActive && audioState.status === 'loading') {
            return <><LoaderIcon className="w-5 h-5 animate-spin" /><span>Gerando...</span></>;
        }
        if (isCurrentParagraphActive && audioState.status === 'playing') {
            return <><LoaderIcon className="w-5 h-5" /><span>Pausar Áudio</span></>;
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

    const Footer = () => (
        <footer className="text-center py-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Powered by Amândio Vaz - 2025
            </p>
        </footer>
    );

    const hasActiveAudio = audioState.status !== 'idle';

    return (
        <div className="bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 min-h-screen flex flex-col">
            {!isFocusMode && <Header />}
            <main className={`flex-grow ${isFocusMode ? 'p-0' : 'p-4 md:p-8'} ${hasActiveAudio && !isFocusMode ? 'pb-32 md:pb-28' : ''}`}>
                {!doc && <UrlForm />}
                {isLoading && (
                    <div className="text-center mt-12 flex flex-col items-center">
                        <LoaderIcon className="w-12 h-12 animate-spin text-indigo-500" />
                        <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">Mapeando a estrutura do site e extraindo toda a documentação... Isso pode levar alguns minutos.</p>
                    </div>
                )}
                {error && <div className="text-center mt-8 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 p-4 rounded-md max-w-2xl mx-auto border border-red-300 dark:border-red-700">{error}</div>}
                
                {doc && (
                    <div className={`${isFocusMode ? '' : 'max-w-7xl mx-auto mt-6'}`}>
                        {!isFocusMode && (
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center md:text-left">{doc.title}</h2>
                                <div className="flex items-center gap-3 flex-wrap justify-center md:justify-end">
                                    <button 
                                        onClick={handleCopyToClipboard} 
                                        className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md transition ${
                                            copyStatus === 'copied' 
                                            ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200' 
                                            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                                        }`} 
                                        title="Copiar conteúdo em Markdown"
                                    >
                                        {copyStatus === 'copied' ? <CheckIcon className="w-5 h-5" /> : <CopyIcon className="w-5 h-5" />}
                                        {copyStatus === 'copied' ? 'Copiado!' : 'Copiar Markdown'}
                                    </button>
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
                        )}
                        <div className={`${isFocusMode ? '' : 'grid grid-cols-1 lg:grid-cols-12 gap-8'}`}>
                            {!isFocusMode && (
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
                                        <ul className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
                                            {flattenedChapters.length > 0 ? (
                                                flattenedChapters.map((item) => {
                                                    const { chapter, level, parentIndex, originalIndex } = item;
                                                    const isSearchResult = searchResults.includes(originalIndex);
                                                    return (
                                                    <li key={originalIndex} className="flex items-center gap-1 group">
                                                        <button 
                                                            onClick={() => handleChapterSelect(originalIndex)} 
                                                            style={{ paddingLeft: `${12 + level * 20}px` }}
                                                            className={`flex-grow text-left p-3 rounded-lg text-sm transition-all duration-200 ${
                                                                selectedChapterIndex === originalIndex 
                                                                ? 'bg-indigo-600 text-white font-bold shadow-md' 
                                                                : isSearchResult
                                                                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-gray-800 dark:text-gray-200 hover:bg-indigo-200 dark:hover:bg-indigo-900/60'
                                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                            }`}
                                                        >
                                                            {chapter.title}
                                                        </button>
                                                        {parentIndex !== null && (
                                                            <button 
                                                                onClick={() => handleChapterSelect(parentIndex)}
                                                                className="flex-shrink-0 p-2 rounded-full text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
                                                                title="Ir para o Tópico Pai"
                                                            >
                                                                <ReplyIcon className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleGenerateSummary(originalIndex)}
                                                            disabled={summaryState.isLoading && summaryState.chapterIndex === originalIndex}
                                                            className="flex-shrink-0 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-50 disabled:cursor-wait transition"
                                                            title="Gerar resumo do capítulo"
                                                        >
                                                            {summaryState.isLoading && summaryState.chapterIndex === originalIndex ? (
                                                                <LoaderIcon className="w-5 h-5 animate-spin" />
                                                            ) : (
                                                                <DocumentTextIcon className="w-5 h-5" />
                                                            )}
                                                        </button>
                                                    </li>
                                                )})
                                            ) : (
                                                <li className="text-gray-500 dark:text-gray-400 text-center p-4 text-sm">Nenhum capítulo encontrado.</li>
                                            )}
                                        </ul>
                                    </div>
                                </aside>
                            )}
                            <article className={`${
                                isFocusMode
                                ? 'h-screen overflow-y-auto'
                                : 'lg:col-span-8 xl:col-span-9 min-h-[70vh]'
                                } bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700`}
                            >
                                {flattenedChapters[selectedChapterIndex] && (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                                            <div className="flex justify-between items-center mb-4">
                                                <div className="flex items-center gap-4">
                                                    <h3 className="text-2xl font-bold text-indigo-500 dark:text-indigo-400">{flattenedChapters[selectedChapterIndex].chapter.title}</h3>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {!isFocusMode && (
                                                        <button
                                                            onClick={() => setIsFocusMode(true)}
                                                            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                            title="Modo Focado"
                                                            aria-label="Entrar no modo focado"
                                                        >
                                                            <ArrowsPointingOutIcon className="w-6 h-6" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 mb-4">
                                                <button 
                                                    onClick={() => setSelectedChapterIndex(prev => Math.max(0, prev - 1))}
                                                    disabled={selectedChapterIndex === 0}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                                                >
                                                    <ChevronLeftIcon className="w-4 h-4"/>
                                                    <span>Anterior</span>
                                                </button>
                                                <button 
                                                    onClick={() => setSelectedChapterIndex(prev => Math.min(flattenedChapters.length - 1, prev + 1))}
                                                    disabled={selectedChapterIndex === flattenedChapters.length - 1}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
                                                >
                                                    <span>Próximo</span>
                                                    <ChevronRightIcon className="w-4 h-4"/>
                                                </button>
                                            </div>

                                            <div className={`prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none prose-pre:bg-gray-100 dark:prose-pre:bg-gray-900 prose-pre:rounded-md prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-gray-600 prose-img:rounded-md`}>
                                                <div className={`${isFocusMode ? 'max-w-3xl mx-auto py-8' : ''}`}>
                                                    <div
                                                        className="select-text"
                                                        dangerouslySetInnerHTML={{ __html: converter.makeHtml(flattenedChapters[selectedChapterIndex].chapter.content) }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </article>
                        </div>
                    </div>
                )}
            </main>

            {summaryState.isModalOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700">
                        <header className="p-4 border-b border-gray-200 dark:border-gray-600">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Resumo de: <span className="text-indigo-500">{summaryState.chapterTitle}</span>
                            </h3>
                        </header>
                        <main className="p-6 overflow-y-auto custom-scrollbar">
                            {summaryState.isLoading ? (
                                <div className="flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
                                    <LoaderIcon className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
                                    <p>Gerando resumo com IA...</p>
                                </div>
                            ) : summaryState.error ? (
                                <div className="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 p-3 rounded-md border border-red-300 dark:border-red-700">
                                    <strong>Erro:</strong> {summaryState.error}
                                </div>
                            ) : summaryState.content ? (
                                <div
                                    className={`prose ${theme === 'dark' ? 'prose-invert' : ''} max-w-none`}
                                    dangerouslySetInnerHTML={{ __html: converter.makeHtml(summaryState.content) }}
                                />
                            ) : null}
                        </main>
                        <footer className="p-4 border-t border-gray-200 dark:border-gray-600 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleCopySummary}
                                    disabled={!summaryState.content || summaryState.isLoading}
                                    className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed ${
                                        summaryState.summaryCopyStatus === 'copied'
                                        ? 'bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-200'
                                        : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                                    }`}
                                >
                                    {summaryState.summaryCopyStatus === 'copied' ? <CheckIcon className="w-5 h-5" /> : <CopyIcon className="w-5 h-5" />}
                                    <span>{summaryState.summaryCopyStatus === 'copied' ? 'Copiado!' : 'Copiar Resumo'}</span>
                                </button>
                                <button
                                    onClick={handleExportSummary}
                                    disabled={!summaryState.content || summaryState.isLoading}
                                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Baixar resumo como arquivo de texto"
                                >
                                    <DocumentTextIcon className="w-5 h-5" />
                                    <span>Exportar Resumo</span>
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setSummaryState(prev => ({ ...prev, isModalOpen: false }))}
                                    className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md font-semibold transition text-sm"
                                >
                                    Fechar
                                </button>
                                <button
                                    onClick={handleGoToChapterFromSummary}
                                    disabled={summaryState.chapterIndex === null}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition text-sm disabled:opacity-50"
                                >
                                    <span>Ir para Capítulo</span>
                                    <ChevronRightIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </footer>
                    </div>
                </div>
            )}
            {isFocusMode && (
                <button 
                    onClick={() => setIsFocusMode(false)}
                    className="fixed top-4 right-4 z-50 p-2 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 transition"
                    aria-label="Sair do Modo Focado"
                >
                    <ArrowsPointingInIcon className="w-6 h-6" />
                </button>
            )}
            <AudioPlayerComponent
                audioState={audioState}
                onPlayPause={playPause}
                onStop={stopAudio}
                onSeek={seekTo}
                onVolumeChange={handleVolumeChange}
                onMuteToggle={handleMuteToggle}
                onSpeedChange={handleSpeedChange}
                onNext={() => {}}
                onPrevious={() => {}}
            />
            {!isFocusMode && <Footer />}
        </div>
    );
}