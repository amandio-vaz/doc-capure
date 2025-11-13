
import React, { useState, useRef, useCallback } from 'react';
import { Documentation, Chapter } from './types';
import { extractDocumentation, generateSpeech } from './services/geminiService';
import { decodeAudioData, decode } from './utils/audioUtils';
import { generateAndDownloadMarkdown, generateAndDownloadHtml, generateAndPrint } from './utils/fileUtils';
import {
    SparklesIcon, LinkIcon, LoaderIcon, PlayIcon, PauseIcon,
    StopIcon, MarkdownIcon, HtmlIcon, PdfIcon, AudioIcon
} from './components/icons';

type AudioState = {
    status: 'idle' | 'loading' | 'playing' | 'error';
    chapterIndex: number | null;
    errorMessage?: string;
}

export default function App() {
    const [url, setUrl] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [doc, setDoc] = useState<Documentation | null>(null);
    const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
    const [audioState, setAudioState] = useState<AudioState>({ status: 'idle', chapterIndex: null });

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

    const handleProcessUrl = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!url) {
            setError("Por favor, insira uma URL.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setDoc(null);
        setAudioState({ status: 'idle', chapterIndex: null });

        try {
            const documentation = await extractDocumentation(url);
            setDoc(documentation);
            setSelectedChapterIndex(0);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Ocorreu um erro desconhecido.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const stopCurrentAudio = useCallback(() => {
        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
    }, []);

    const handleAudioToggle = useCallback(async (chapterIndex: number) => {
        // Stop any currently playing audio
        stopCurrentAudio();

        if (audioState.status === 'playing' && audioState.chapterIndex === chapterIndex) {
            setAudioState({ status: 'idle', chapterIndex: null });
            return;
        }

        setAudioState({ status: 'loading', chapterIndex });
        
        try {
            const chapterContent = doc?.chapters[chapterIndex]?.content;
            if (!chapterContent) throw new Error("Conteúdo do capítulo não encontrado.");

            const base64Audio = await generateSpeech(chapterContent);
            
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            }
            
            const audioContext = audioContextRef.current;
            const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.onended = () => {
                setAudioState(prevState => {
                    if (prevState.chapterIndex === chapterIndex) {
                        return { status: 'idle', chapterIndex: null };
                    }
                    return prevState;
                });
            };
            source.start();
            audioSourceRef.current = source;
            setAudioState({ status: 'playing', chapterIndex });

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Erro ao tocar áudio.";
            setAudioState({ status: 'error', chapterIndex, errorMessage });
            setTimeout(() => setAudioState({ status: 'idle', chapterIndex: null }), 3000);
        }

    }, [doc, audioState, stopCurrentAudio]);

    const handleDownload = (format: 'md' | 'html' | 'pdf') => {
        if (!doc) return;
        if (format === 'md') generateAndDownloadMarkdown(doc);
        if (format === 'html') generateAndDownloadHtml(doc);
        if (format === 'pdf') generateAndPrint(doc);
    };

    const Header = () => (
        <header className="text-center p-6 border-b border-gray-700">
            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500 flex items-center justify-center gap-3">
                <SparklesIcon className="w-10 h-10" />
                DocuSynth AI
            </h1>
            <p className="text-gray-400 mt-2 text-lg">Transforme documentações em conteúdo estruturado e audível.</p>
        </header>
    );

    const UrlForm = () => (
        <div className="w-full max-w-2xl mx-auto mt-10 px-4">
            <form onSubmit={handleProcessUrl} className="flex flex-col sm:flex-row items-center gap-3 bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
                <div className="relative w-full">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="Cole a URL da documentação aqui..."
                        className="w-full bg-gray-700 text-white rounded-md pl-10 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
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
        <div className="bg-gray-900 text-gray-200 min-h-screen">
            <Header />
            <main className="p-4 md:p-8">
                {!doc && <UrlForm />}
                {isLoading && (
                    <div className="text-center mt-12 flex flex-col items-center">
                        <LoaderIcon className="w-12 h-12 animate-spin text-indigo-500" />
                        <p className="mt-4 text-lg text-gray-400">Analisando e estruturando a documentação... Isso pode levar um momento.</p>
                    </div>
                )}
                {error && <div className="text-center mt-8 bg-red-900/50 text-red-300 p-4 rounded-md max-w-2xl mx-auto border border-red-700">{error}</div>}
                
                {doc && (
                    <div className="max-w-7xl mx-auto mt-6">
                        <div className="bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-700 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                            <h2 className="text-2xl font-bold text-white text-center md:text-left">{doc.title}</h2>
                            <div className="flex items-center gap-3">
                                <button onClick={() => handleDownload('md')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-sm px-3 py-2 rounded-md transition"><MarkdownIcon className="w-5 h-5" /> MD</button>
                                <button onClick={() => handleDownload('html')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-sm px-3 py-2 rounded-md transition"><HtmlIcon className="w-5 h-5" /> HTML</button>
                                <button onClick={() => handleDownload('pdf')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-sm px-3 py-2 rounded-md transition"><PdfIcon className="w-5 h-5" /> PDF</button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            <aside className="lg:col-span-4 xl:col-span-3">
                                <div className="sticky top-8 bg-gray-800 rounded-lg p-4 border border-gray-700">
                                    <h3 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">Capítulos</h3>
                                    <ul className="space-y-2 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                                        {doc.chapters.map((chapter, index) => (
                                            <li key={index}>
                                                <button onClick={() => setSelectedChapterIndex(index)} className={`w-full text-left p-3 rounded-md text-sm transition ${selectedChapterIndex === index ? 'bg-indigo-600 text-white font-semibold' : 'hover:bg-gray-700'}`}>
                                                    {chapter.title}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </aside>
                            <article className="lg:col-span-8 xl:col-span-9 bg-gray-800 rounded-lg p-6 border border-gray-700 min-h-[70vh]">
                                {doc.chapters[selectedChapterIndex] && (
                                    <>
                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4 pb-4 border-b border-gray-700">
                                            <h3 className="text-2xl font-bold text-indigo-400">{doc.chapters[selectedChapterIndex].title}</h3>
                                            <button 
                                              onClick={() => handleAudioToggle(selectedChapterIndex)} 
                                              disabled={audioState.status === 'loading'}
                                              className="flex items-center gap-2 px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold transition disabled:bg-purple-400 disabled:cursor-wait"
                                            >
                                                {audioState.chapterIndex === selectedChapterIndex && audioState.status === 'loading' && <LoaderIcon className="w-5 h-5 animate-spin" />}
                                                {audioState.chapterIndex === selectedChapterIndex && audioState.status === 'playing' ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                                                <span>{audioState.chapterIndex === selectedChapterIndex && audioState.status === 'playing' ? 'Pausar Áudio' : 'Ouvir Capítulo'}</span>
                                            </button>
                                        </div>
                                        {audioState.status === 'error' && audioState.chapterIndex === selectedChapterIndex && <div className="mb-4 p-2 text-sm bg-red-900/50 text-red-300 rounded border border-red-700">{audioState.errorMessage}</div>}
                                        <div
                                            className="prose prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:rounded-md prose-pre:border prose-pre:border-gray-600 prose-img:rounded-md"
                                            dangerouslySetInnerHTML={{ __html: doc.chapters[selectedChapterIndex].content.replace(/\n/g, '<br />') }}
                                        />
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
