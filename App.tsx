import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Documentation, Chapter, AudioConfig } from './types';
import { generateStudyPlan, generateChapterSummary } from './services/geminiService';
import { generateAndDownloadMarkdown, generateAndDownloadHtml, generateAndPrint, downloadAsFile } from './utils/fileUtils';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { AudioPlayerComponent } from './components/AudioPlayer';
import {
    SparklesIcon, LoaderIcon, PlayIcon,
    StopIcon, MarkdownIcon, HtmlIcon, PdfIcon, ChevronLeftIcon, ChevronRightIcon,
    SearchIcon, CopyIcon, CheckIcon, DocumentTextIcon,
    ArrowsPointingOutIcon, ArrowsPointingInIcon, ReplyIcon,
    UploadCloudIcon, XCircleIcon, FileIcon, WordIcon, AudioIcon, StarIcon
} from './components/icons';


declare const showdown: any;

type CopyStatus = 'idle' | 'copied';

const AVAILABLE_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];
const MOCK_EXAMS: { [key: string]: string } = {
    'AZ-104': 'Microsoft Certified: Azure Administrator Associate',
    'CCNA 200-301': 'Cisco Certified Network Associate',
    'AWS-SAA-C03': 'AWS Certified Solutions Architect – Associate',
    'GCP-ACE': 'Google Cloud Certified - Associate Cloud Engineer'
};

interface FlattenedChapter {
    chapter: Chapter;
    level: number;
    parentIndex: number | null;
    originalIndex: number;
}

const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    switch (extension) {
        case 'pdf':
            return <PdfIcon className="w-6 h-6 text-red-400" />;
        case 'md':
            return <MarkdownIcon className="w-6 h-6 text-gray-400" />;
        case 'html':
            return <HtmlIcon className="w-6 h-6 text-orange-400" />;
        case 'doc':
        case 'docx':
            return <WordIcon className="w-6 h-6" />;
        default:
            return <FileIcon className="w-6 h-6 text-blue-400" />;
    }
};

export default function App() {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [doc, setDoc] = useState<Documentation | null>(null); // 'doc' agora é o plano de estudo
    const [selectedChapterIndex, setSelectedChapterIndex] = useState<number>(0);
    const [isFocusMode, setIsFocusMode] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
    const contentContainerRef = useRef<HTMLElement>(null);
    const [focusedTopicIndex, setFocusedTopicIndex] = useState<number | null>(null);
    const listRef = useRef<HTMLUListElement>(null);

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

    const converter = useRef(new showdown.Converter({
        ghCompatibleHeaderId: true,
        simpleLineBreaks: true,
        tables: true
    })).current;

    const [audioConfig, setAudioConfig] = useState<AudioConfig>(() => {
        try {
            const savedConfig = localStorage.getItem('audioConfig');
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                if (AVAILABLE_VOICES.includes(parsed.voice)) {
                    return parsed;
                }
            }
        } catch (e) { console.error("Falha ao analisar config de áudio", e); }
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
        return flatten(doc.chapters, 0, null).map((item, index) => ({ ...item, originalIndex: index }));
    }, [doc]);

    const autoPlayOnChapterChangeRef = useRef(false);
    
    const onAudioEnded = useCallback(() => {
        // Lógica para avançar para o próximo capítulo quando o áudio termina.
        if (selectedChapterIndex < flattenedChapters.length - 1) {
            // Ativa a flag de autoplay.
            autoPlayOnChapterChangeRef.current = true;
            // Avança para o próximo capítulo, o que irá acionar o useEffect de autoplay.
            setSelectedChapterIndex(prev => prev + 1);
        }
    }, [selectedChapterIndex, flattenedChapters.length]);

    const { audioState, loadAndPlay, playPause, stopAudio, seekTo, handleVolumeChange, handleMuteToggle, handleSpeedChange } = useAudioPlayer({ audioConfig, setAudioConfig });

    useEffect(() => {
        try {
            localStorage.setItem('audioConfig', JSON.stringify(audioConfig));
        } catch (e) { console.error("Falha ao salvar config de áudio", e); }
    }, [audioConfig]);

    // Este efeito lida com a funcionalidade de autoplay.
    useEffect(() => {
        // Verifica se a mudança de capítulo foi acionada pelo autoplay.
        if (autoPlayOnChapterChangeRef.current && doc) {
            // Reseta a flag para evitar que o autoplay seja acionado em navegações manuais.
            autoPlayOnChapterChangeRef.current = false;
            
            const currentChapter = flattenedChapters[selectedChapterIndex];
            if (currentChapter) {
                 // Inicia a reprodução do novo capítulo, passando o mesmo callback `onEnded`
                 // para encadear a reprodução para os próximos capítulos.
                 loadAndPlay(
                    currentChapter.chapter.content,
                    selectedChapterIndex,
                    -1, // -1 indica que é o capítulo inteiro
                    onAudioEnded,
                    currentChapter.chapter.title
                );
            }
        }
    }, [selectedChapterIndex, doc, flattenedChapters, loadAndPlay, onAudioEnded]);
    
    // Efeito para destacar resultados da busca e rolar para o primeiro
    useEffect(() => {
        const container = contentContainerRef.current;
        if (!container) return;

        // Função para remover destaques anteriores
        const removeHighlights = () => {
            const marks = container.querySelectorAll('mark.cortex-highlight');
            marks.forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
                    parent.normalize(); // Junta nós de texto adjacentes
                }
            });
        };

        removeHighlights();

        if (!searchQuery.trim()) {
            setFocusedTopicIndex(selectedChapterIndex);
            return; // Sai se a busca estiver vazia
        }

        const query = searchQuery.trim();
        const regex = new RegExp(`(${query})`, 'gi');
        
        // Percorre todos os nós de texto para aplicar o destaque
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        let node;
        const nodesToProcess: Text[] = [];
        while ((node = walker.nextNode())) {
            if (node.textContent && node.textContent.match(regex)) {
                nodesToProcess.push(node as Text);
            }
        }

        nodesToProcess.forEach(textNode => {
            const text = textNode.textContent!;
            const parts = text.split(regex);
            if (parts.length > 1) {
                const fragment = document.createDocumentFragment();
                parts.forEach((part, index) => {
                    if (index % 2 === 1) { // Parte correspondente à busca
                        const mark = document.createElement('mark');
                        mark.className = 'cortex-highlight bg-yellow-500/50 text-white rounded px-1';
                        mark.textContent = part;
                        fragment.appendChild(mark);
                    } else if (part) {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                textNode.parentNode?.replaceChild(fragment, textNode);
            }
        });
        
        // Rola para o primeiro resultado encontrado
        const firstHighlight = container.querySelector('mark.cortex-highlight');
        if (firstHighlight) {
            firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

    }, [searchQuery, selectedChapterIndex, doc]);

    // Efeito para navegação por teclado na lista de tópicos
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!listRef.current || flattenedChapters.length === 0) return;

            const currentFocused = focusedTopicIndex === null ? selectedChapterIndex : focusedTopicIndex;
            let nextIndex = currentFocused;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    nextIndex = Math.min(flattenedChapters.length - 1, currentFocused + 1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    nextIndex = Math.max(0, currentFocused - 1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (focusedTopicIndex !== null) {
                        handleChapterSelect(focusedTopicIndex);
                    }
                    return; // Retorna para não chamar setFocusedTopicIndex novamente
                case 'Home':
                    e.preventDefault();
                    nextIndex = 0;
                    break;
                case 'End':
                    e.preventDefault();
                    nextIndex = flattenedChapters.length - 1;
                    break;
                default:
                    return; // Ignora outras teclas
            }

            if (nextIndex !== currentFocused) {
                setFocusedTopicIndex(nextIndex);
                // Garante que o item focado esteja visível
                const itemElement = listRef.current.querySelector(`[data-index="${nextIndex}"]`);
                itemElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        };

        const listElement = listRef.current;
        listElement?.addEventListener('keydown', handleKeyDown);

        return () => {
            listElement?.removeEventListener('keydown', handleKeyDown);
        };
    }, [focusedTopicIndex, selectedChapterIndex, flattenedChapters]);

    useEffect(() => {
      setFocusedTopicIndex(selectedChapterIndex);
    }, [selectedChapterIndex]);

    const handleGeneratePlan = async (files: File[], examCode: string, additionalTopics: string) => {
        if (files.length === 0 || !examCode.trim()) {
            setError("Por favor, adicione arquivos e um código de exame.");
            return;
        }
    
        setIsLoading(true);
        setError(null);
        setDoc(null);
    
        try {
            const fileContents = await Promise.all(
                files.map(file => new Promise<{name: string; content: string}>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({ name: file.name, content: reader.result as string });
                    reader.onerror = (error) => reject(new Error(`Erro ao ler o arquivo ${file.name}: ${error}`));
                    // Simplificação: Trata todos os arquivos como texto. Para PDF/DOCX, seria necessário uma lib de extração.
                    reader.readAsText(file);
                }))
            );

            const studyPlan = await generateStudyPlan(fileContents, examCode, additionalTopics);
            setDoc(studyPlan);
            setSelectedChapterIndex(0);
            setFocusedTopicIndex(0);
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
        const markdownContent = `# ${doc.title}\n\n` + doc.chapters.map(chapter => `## ${chapter.title}\n\n${chapter.content}`).join('\n\n---\n\n');
        
        navigator.clipboard.writeText(markdownContent).then(() => {
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }).catch(err => console.error('Falha ao copiar texto: ', err));
    };

    const handleChapterSelect = (index: number) => {
        if (audioState.status === 'playing' || audioState.status === 'paused') {
            autoPlayOnChapterChangeRef.current = true;
        } else {
             autoPlayOnChapterChangeRef.current = false;
        }
        setSelectedChapterIndex(index);
    };

    const handleGenerateSummary = async (chapterIndex: number) => {
        if (!doc || !flattenedChapters[chapterIndex]) return;
        const { chapter } = flattenedChapters[chapterIndex];
        
        setSummaryState({
            isLoading: true, error: null, content: null, chapterTitle: chapter.title, 
            isModalOpen: true, chapterIndex: chapterIndex, summaryCopyStatus: 'idle',
        });

        try {
            const summary = await generateChapterSummary(chapter.title, chapter.content);
            setSummaryState(prev => ({ ...prev, content: summary, isLoading: false }));
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao gerar resumo.";
            setSummaryState(prev => ({ ...prev, error: errorMessage, isLoading: false }));
        }
    };

    const handleCopySummary = () => {
        if (!summaryState.content) return;
        navigator.clipboard.writeText(summaryState.content).then(() => {
            setSummaryState(prev => ({ ...prev, summaryCopyStatus: 'copied' }));
            setTimeout(() => setSummaryState(prev => prev.isModalOpen ? { ...prev, summaryCopyStatus: 'idle' } : prev), 2000);
        }).catch(err => console.error('Falha ao copiar resumo: ', err));
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
    
    const handlePlaySummary = () => {
        if (!summaryState.content || summaryState.chapterIndex === null || !summaryState.chapterTitle) return;

        // Ao tocar um resumo, o callback onEnded é uma função vazia para não avançar para o próximo capítulo.
        loadAndPlay(
            summaryState.content,
            summaryState.chapterIndex,
            -1, // Usar -1 para indicar que é um resumo, não um parágrafo
            () => {}, // Callback de 'onEnded' vazio para resumos
            `Resumo: ${summaryState.chapterTitle}`
        );
        
        // Fechar o modal para o usuário ver o player
        setSummaryState(prev => ({ ...prev, isModalOpen: false }));
    };

    const handlePreviousChapter = () => {
        if (selectedChapterIndex > 0) {
            // Se o áudio já estiver tocando, ativa o autoplay para o capítulo anterior.
            if (audioState.status === 'playing' || audioState.status === 'paused') {
                autoPlayOnChapterChangeRef.current = true;
            }
            setSelectedChapterIndex(prev => prev - 1);
        }
    };
    
    const handleNextChapter = () => {
        if (selectedChapterIndex < flattenedChapters.length - 1) {
            // Se o áudio já estiver tocando, ativa o autoplay para o próximo capítulo.
            if (audioState.status === 'playing' || audioState.status === 'paused') {
                autoPlayOnChapterChangeRef.current = true;
            }
            setSelectedChapterIndex(prev => prev + 1);
        }
    };

    const searchResults = useMemo(() => {
        if (!doc || !searchQuery) return [];
        return flattenedChapters.filter(fc => fc.chapter.title.toLowerCase().includes(searchQuery.toLowerCase())).map(fc => fc.originalIndex);
    }, [doc, searchQuery, flattenedChapters]);
    
    const Header = () => (
        <header className="relative text-center p-6">
            <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center gap-3">
                <SparklesIcon className="w-10 h-10" />
                Cortex DeepMind
            </h1>
            <p className="text-gray-400 mt-2 text-lg">Seu plano de estudo para certificação, turbinado com IA.</p>
        </header>
    );

    const StudyPlanForm = () => {
        const [files, setFiles] = useState<File[]>([]);
        const [examCode, setExamCode] = useState<string>('');
        const [examName, setExamName] = useState<string>('');
        const [additionalTopics, setAdditionalTopics] = useState<string>('');
        const [isDragging, setIsDragging] = useState(false);
        const fileInputRef = useRef<HTMLInputElement>(null);
    
        useEffect(() => {
            const upperExamCode = examCode.toUpperCase().trim();
            const foundName = MOCK_EXAMS[upperExamCode as keyof typeof MOCK_EXAMS];
            if (foundName) {
                setExamName(foundName);
            } else {
                setExamName(upperExamCode ? 'Código não reconhecido' : '');
            }
        }, [examCode]);
    
        const handleFiles = (incomingFiles: FileList | null) => {
            if (!incomingFiles) return;
            setFiles(prev => {
                const combined = [...prev, ...Array.from(incomingFiles)];
                const unique = combined.filter((file, index, self) => index === self.findIndex(f => f.name === file.name));
                return unique.slice(0, 10);
            });
        };
    
        const removeFile = (fileName: string) => setFiles(prev => prev.filter(f => f.name !== fileName));
    
        const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
        const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
        const onDrop = (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
        };
    
        return (
            <div className="w-full max-w-3xl mx-auto mt-10 px-4">
                <form onSubmit={(e) => { e.preventDefault(); handleGeneratePlan(files, examCode, additionalTopics); }} className="flex flex-col gap-6 bg-gray-900/50 backdrop-blur-sm p-6 rounded-2xl border border-gray-800">
                    <div>
                        <label className="block text-lg font-semibold mb-3 text-gray-200">1. Adicione seus materiais de estudo</label>
                        <div
                            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-600 hover:border-gray-500'}`}
                        >
                            <UploadCloudIcon className="w-12 h-12 text-gray-500 mb-3" />
                            <p className="text-gray-400">Arraste e solte até 10 arquivos aqui</p>
                            <p className="text-sm text-gray-500">ou clique para selecionar (PDF, MD, DOCX, HTML)</p>
                            <input type="file" ref={fileInputRef} onChange={e => handleFiles(e.target.files)} multiple hidden accept=".pdf,.md,.docx,.doc,.html" />
                        </div>
                        {files.length > 0 && (
                            <div className="mt-4 space-y-2">
                                {files.map(file => (
                                    <div key={file.name} className="flex items-center justify-between bg-gray-800 p-2 rounded-md text-sm">
                                        <div className="flex items-center gap-3">
                                            {getFileIcon(file.name)}
                                            <span className="text-gray-300">{file.name}</span>
                                        </div>
                                        <button type="button" onClick={() => removeFile(file.name)} className="p-1 text-gray-500 hover:text-red-400 rounded-full">
                                            <XCircleIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
    
                    <div>
                        <label htmlFor="exam-code" className="block text-lg font-semibold mb-3 text-gray-200">2. Insira o código do exame</label>
                        <input
                            id="exam-code" type="text" value={examCode} onChange={e => setExamCode(e.target.value)}
                            placeholder="Ex: AZ-104, CCNA 200-301..."
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                            disabled={isLoading}
                            required
                        />
                        <p className="text-sm text-indigo-400 mt-2 h-5">{examName}</p>
                    </div>

                    <div>
                        <label htmlFor="additional-topics" className="block text-lg font-semibold mb-3 text-gray-200">3. Adicione Tópicos Extras (Opcional)</label>
                        <textarea
                            id="additional-topics"
                            value={additionalTopics}
                            onChange={e => setAdditionalTopics(e.target.value)}
                            placeholder="Liste tópicos ou perguntas específicas que você quer cobrir, um por linha..."
                            className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition h-28"
                            disabled={isLoading}
                        />
                    </div>
    
                    <button type="submit" disabled={isLoading || files.length === 0 || !examCode} className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold px-6 py-4 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-300 text-lg shadow-lg shadow-indigo-900/50">
                        {isLoading ? <LoaderIcon className="animate-spin w-6 h-6" /> : <SparklesIcon className="w-6 h-6" />}
                        <span>{isLoading ? 'Gerando Plano...' : 'Gerar Plano de Estudo'}</span>
                    </button>
                </form>
            </div>
        );
    };

    const Footer = () => (
        <footer className="text-center py-6 border-t border-gray-800/50">
            <p className="text-sm text-gray-500">Desenvolvido com ❤️ por Amândio Vaz - 2025</p>
        </footer>
    );

    const hasActiveAudio = audioState.status !== 'idle';

    return (
        <div className="bg-transparent text-gray-200 min-h-screen flex flex-col">
            {!isFocusMode && <Header />}
            <main className={`flex-grow ${isFocusMode ? 'p-0' : 'p-4 md:p-8'} ${hasActiveAudio && !isFocusMode ? 'pb-32 md:pb-28' : ''}`}>
                {!doc && <StudyPlanForm />}
                {isLoading && (
                    <div className="text-center mt-12 flex flex-col items-center">
                        <LoaderIcon className="w-12 h-12 animate-spin text-indigo-400" />
                        <p className="mt-4 text-lg text-gray-400">Analisando seus materiais e pesquisando a web... Isso pode levar alguns minutos.</p>
                    </div>
                )}
                {error && <div className="text-center mt-8 bg-red-900/30 text-red-300 p-4 rounded-md max-w-3xl mx-auto border border-red-700/50">{error}</div>}
                
                {doc && (
                    <div className={`${isFocusMode ? '' : 'max-w-7xl mx-auto mt-6'}`}>
                        {!isFocusMode && (
                            <div className="bg-gray-900/50 backdrop-blur-sm p-4 rounded-lg border border-gray-800 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
                                <h2 className="text-2xl font-bold text-white text-center md:text-left">{doc.title}</h2>
                                <div className="flex items-center gap-3 flex-wrap justify-center md:justify-end">
                                    <button onClick={handleCopyToClipboard} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md transition ${copyStatus === 'copied' ? 'bg-green-800 text-green-200' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`} title="Copiar conteúdo em Markdown">
                                        {copyStatus === 'copied' ? <CheckIcon className="w-5 h-5" /> : <CopyIcon className="w-5 h-5" />}
                                        {copyStatus === 'copied' ? 'Copiado!' : 'Copiar MD'}
                                    </button>
                                    <button onClick={() => handleDownload('md')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm px-3 py-2 rounded-md transition" title="Baixar arquivo Markdown">
                                        <MarkdownIcon className="w-5 h-5" /> MD
                                    </button>
                                    <button onClick={() => handleDownload('html')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm px-3 py-2 rounded-md transition" title="Baixar arquivo HTML">
                                        <HtmlIcon className="w-5 h-5" /> HTML
                                    </button>
                                    <button onClick={() => handleDownload('pdf')} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm px-3 py-2 rounded-md transition" title="Salvar como PDF">
                                        <PdfIcon className="w-5 h-5" /> PDF
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className={`${isFocusMode ? '' : 'grid grid-cols-1 lg:grid-cols-12 gap-8'}`}>
                            {!isFocusMode && (
                                <aside className="lg:col-span-4 xl:col-span-3">
                                    <div className="sticky top-8 bg-gray-900/50 backdrop-blur-sm rounded-lg p-4 border border-gray-800">
                                        <h3 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2">Tópicos do Plano</h3>
                                        <div className="relative mb-4">
                                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                                            <input
                                                type="text" placeholder="Buscar tópicos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-gray-800 border border-gray-700 text-white rounded-md pl-10 pr-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                                            />
                                        </div>
                                        <ul ref={listRef} tabIndex={0} className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md">
                                            {flattenedChapters.map(({ chapter, level, parentIndex, originalIndex }) => (
                                                <li key={originalIndex} data-index={originalIndex} className="flex items-center gap-1 group">
                                                    <a
                                                        href="#"
                                                        onClick={(e) => { e.preventDefault(); handleChapterSelect(originalIndex); }}
                                                        style={{ paddingLeft: `${12 + level * 20}px` }}
                                                        className={`flex-grow text-left p-3 rounded-lg text-sm transition-all duration-200 ${selectedChapterIndex === originalIndex ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold shadow-md' : searchResults.includes(originalIndex) ? 'bg-indigo-900/40 text-gray-200 hover:bg-indigo-900/60' : 'text-gray-300 hover:bg-gray-800'} ${focusedTopicIndex === originalIndex ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-indigo-500' : ''}`}
                                                    >
                                                        {chapter.title}
                                                    </a>
                                                     {parentIndex !== null && (
                                                        <button onClick={() => handleChapterSelect(parentIndex)} className="flex-shrink-0 p-2 rounded-full text-gray-500 opacity-0 group-hover:opacity-100 hover:bg-gray-700 hover:text-gray-300 transition-opacity" title="Ir para Tópico Pai">
                                                            <ReplyIcon className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleGenerateSummary(originalIndex)} disabled={summaryState.isLoading && summaryState.chapterIndex === originalIndex} className="flex-shrink-0 p-2 rounded-full hover:bg-gray-700 text-gray-400 disabled:opacity-50 disabled:cursor-wait transition" title="Gerar resumo do tópico">
                                                        {summaryState.isLoading && summaryState.chapterIndex === originalIndex ? <LoaderIcon className="w-5 h-5 animate-spin" /> : <DocumentTextIcon className="w-5 h-5" />}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </aside>
                            )}
                            <article ref={contentContainerRef} className={`${isFocusMode ? 'h-screen overflow-y-auto' : 'lg:col-span-8 xl:col-span-9 min-h-[70vh]'} bg-gray-900/50 backdrop-blur-sm rounded-lg p-6 border border-gray-800`}>
                                {flattenedChapters[selectedChapterIndex] && (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-gray-700">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">{flattenedChapters[selectedChapterIndex].chapter.title}</h3>
                                                {!isFocusMode && (
                                                    <button onClick={() => setIsFocusMode(true)} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 transition-colors" title="Modo Focado">
                                                        <ArrowsPointingOutIcon className="w-6 h-6" />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4 mb-4">
                                                <button onClick={() => handleChapterSelect(Math.max(0, selectedChapterIndex - 1))} disabled={selectedChapterIndex === 0} className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition">
                                                    <ChevronLeftIcon className="w-4 h-4"/> <span>Anterior</span>
                                                </button>
                                                <button onClick={() => handleChapterSelect(Math.min(flattenedChapters.length - 1, selectedChapterIndex + 1))} disabled={selectedChapterIndex === flattenedChapters.length - 1} className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition">
                                                    <span>Próximo</span> <ChevronRightIcon className="w-4 h-4"/>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const currentChapter = flattenedChapters[selectedChapterIndex];
                                                        if (currentChapter) {
                                                            loadAndPlay(
                                                                currentChapter.chapter.content,
                                                                selectedChapterIndex,
                                                                -1, // -1 indica que é o capítulo inteiro
                                                                onAudioEnded,
                                                                currentChapter.chapter.title
                                                            );
                                                        }
                                                    }}
                                                    disabled={audioState.status === 'loading'}
                                                    className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-wait transition"
                                                    title="Ouvir o conteúdo deste tópico"
                                                >
                                                    <AudioIcon className="w-4 h-4"/>
                                                    <span>Ouvir</span>
                                                </button>
                                            </div>

                                            <div className={`prose prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:rounded-md prose-pre:border prose-pre:border-gray-700 prose-img:rounded-md prose-a:text-indigo-400 hover:prose-a:text-indigo-300 prose-strong:text-gray-100`}>
                                                <div className={`${isFocusMode ? 'max-w-3xl mx-auto py-8' : ''}`}>
                                                    <div className="select-text" dangerouslySetInnerHTML={{ __html: converter.makeHtml(flattenedChapters[selectedChapterIndex].chapter.content) }}/>
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
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-gray-700">
                        <header className="p-4 border-b border-gray-700">
                            <h3 className="text-lg font-semibold text-white">Resumo de: <span className="text-indigo-400">{summaryState.chapterTitle}</span></h3>
                        </header>
                        <main className="p-6 overflow-y-auto custom-scrollbar">
                            {summaryState.isLoading ? (
                                <div className="flex flex-col items-center justify-center text-center text-gray-400"><LoaderIcon className="w-10 h-10 animate-spin text-indigo-500 mb-4" /><p>Gerando resumo com IA...</p></div>
                            ) : summaryState.error ? (
                                <div className="bg-red-900/50 text-red-300 p-3 rounded-md border border-red-700"><strong>Erro:</strong> {summaryState.error}</div>
                            ) : summaryState.content ? (
                                <div className="prose prose-invert max-w-none prose-a:text-indigo-400" dangerouslySetInnerHTML={{ __html: converter.makeHtml(summaryState.content) }} />
                            ) : null}
                        </main>
                        <footer className="p-4 border-t border-gray-700 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <button onClick={handleCopySummary} disabled={!summaryState.content || summaryState.isLoading} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md transition disabled:opacity-50 ${summaryState.summaryCopyStatus === 'copied' ? 'bg-green-800 text-green-200' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}>
                                    {summaryState.summaryCopyStatus === 'copied' ? <CheckIcon className="w-5 h-5" /> : <CopyIcon className="w-5 h-5" />}
                                    <span>{summaryState.summaryCopyStatus === 'copied' ? 'Copiado!' : 'Copiar'}</span>
                                </button>
                                <button onClick={handleExportSummary} disabled={!summaryState.content || summaryState.isLoading} className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50" title="Baixar resumo">
                                    <DocumentTextIcon className="w-5 h-5" /> <span>Exportar</span>
                                </button>
                                <button onClick={handlePlaySummary} disabled={!summaryState.content || summaryState.isLoading || audioState.status === 'loading'} className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50" title="Ouvir resumo">
                                    <AudioIcon className="w-5 h-5" /> <span>Ouvir</span>
                                </button>
                                <button onClick={() => alert('Funcionalidade de favoritos em desenvolvimento!')} disabled={!summaryState.content || summaryState.isLoading} className="flex items-center gap-2 text-sm px-3 py-2 rounded-md transition bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50" title="Adicionar aos favoritos (em breve)">
                                    <StarIcon className="w-5 h-5" /> <span>Favoritar</span>
                                </button>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSummaryState(prev => ({ ...prev, isModalOpen: false }))} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md font-semibold transition text-sm">Fechar</button>
                                <button onClick={handleGoToChapterFromSummary} disabled={summaryState.chapterIndex === null} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition text-sm disabled:opacity-50">
                                    <span>Ir para Tópico</span> <ChevronRightIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </footer>
                    </div>
                </div>
            )}
            {isFocusMode && (
                <button onClick={() => setIsFocusMode(false)} className="fixed top-4 right-4 z-50 p-2 rounded-full bg-gray-800/80 backdrop-blur-sm text-gray-200 hover:bg-gray-700 border border-gray-600 transition" aria-label="Sair do Modo Focado">
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
                onNext={handleNextChapter}
                onPrevious={handlePreviousChapter}
                isNextDisabled={!doc || selectedChapterIndex >= flattenedChapters.length - 1}
                isPreviousDisabled={!doc || selectedChapterIndex <= 0}
            />
            {!isFocusMode && <Footer />}
        </div>
    );
}