import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Documentation, Chapter, AudioConfig } from './types';
import { generateStudyPlan, generateChapterSummary } from './services/geminiService';
import { generateAndDownloadMarkdown, generateAndDownloadHtml, generateAndPrint, downloadAsFile } from './utils/fileUtils';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { AudioPlayerComponent } from './components/AudioPlayer';
import {
    SparklesIcon, LoaderIcon, PlayIcon,
    MarkdownIcon, HtmlIcon, PdfIcon, ChevronLeftIcon, ChevronRightIcon,
    SearchIcon, CopyIcon, CheckIcon, DocumentTextIcon,
    ArrowsPointingOutIcon, ArrowsPointingInIcon, ReplyIcon,
    UploadCloudIcon, XCircleIcon, FileIcon, WordIcon, AudioIcon, StarIcon,
    Cog6ToothIcon, LinkIcon
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
    isParent: boolean;
}

interface DetailedSearchResult {
    chapterIndex: number;
    snippet: string;
    chapterTitle: string;
    globalIndex: number;
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
    const [activeSearchResultIndex, setActiveSearchResultIndex] = useState<number>(0);
    const [expandedParentIndex, setExpandedParentIndex] = useState<number | null>(0);
    
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

    const flattenedChapters = useMemo((): FlattenedChapter[] => {
        if (!doc) return [];
        const flatten = (chapters: Chapter[], level: number, parentIdx: number | null, result: Omit<FlattenedChapter, 'originalIndex'>[] = []): Omit<FlattenedChapter, 'originalIndex'>[] => {
            chapters.forEach(ch => {
                const currentIndex = result.length;
                const isParent = ch.subChapters && ch.subChapters.length > 0;
                result.push({ chapter: ch, level, parentIndex: parentIdx, isParent });
                if (isParent) {
                    flatten(ch.subChapters, level + 1, currentIndex, result);
                }
            });
            return result;
        };
        return flatten(doc.chapters, 0, null).map((item, index) => ({ ...item, originalIndex: index }));
    }, [doc]);

    // FIX: Moved detailedSearchResults before visibleChapters as it's a dependency.
    const detailedSearchResults = useMemo((): DetailedSearchResult[] => {
        if (!searchQuery.trim()) return [];

        const query = searchQuery.trim();
        const regex = new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
        let globalIndex = 0;
        const results: DetailedSearchResult[] = [];

        flattenedChapters.forEach(({ chapter, originalIndex: chapterIndex }) => {
            const content = chapter.content;
            const matches = [...content.matchAll(regex)];
            
            matches.forEach(match => {
                const matchIndex = match.index || 0;
                const snippetStart = Math.max(0, matchIndex - 40);
                const snippetEnd = Math.min(content.length, matchIndex + query.length + 40);
                let snippet = content.substring(snippetStart, snippetEnd);

                if (snippetStart > 0) snippet = '...' + snippet;
                if (snippetEnd < content.length) snippet = snippet + '...';

                snippet = snippet.replace(regex, `<mark class="bg-transparent text-yellow-300 font-bold rounded">$1</mark>`);

                results.push({
                    chapterIndex,
                    snippet,
                    chapterTitle: chapter.title,
                    globalIndex: globalIndex++,
                });
            });
        });

        return results;
    }, [searchQuery, flattenedChapters]);

    const visibleChapters = useMemo(() => {
        if (searchQuery.trim()) {
            const resultIndexes = new Set(detailedSearchResults.map(r => r.chapterIndex));
            return flattenedChapters.filter(fc => resultIndexes.has(fc.originalIndex));
        }
    
        if (expandedParentIndex === null) {
            return flattenedChapters.filter(fc => fc.level === 0);
        }
    
        const visible: FlattenedChapter[] = [];
    
        for (const fc of flattenedChapters) {
            if (fc.level === 0) {
                visible.push(fc);
            } else if (fc.parentIndex === expandedParentIndex) {
                visible.push(fc);
            }
        }
        return visible;
    }, [flattenedChapters, expandedParentIndex, searchQuery, detailedSearchResults]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setActiveSearchResultIndex(0);
        }
    }, [searchQuery]);

    const autoPlayOnChapterChangeRef = useRef(false);
    
    const { audioState, loadAndPlay, playPause, stopAudio, seekTo, handleVolumeChange, handleMuteToggle, handleSpeedChange } = useAudioPlayer();

    const onAudioEnded = useCallback(() => {
        const isPlayingSummary = audioState.trackInfo.chapterTitle?.startsWith('Resumo:');
        
        const currentFlatIndex = flattenedChapters.findIndex(fc => fc.originalIndex === selectedChapterIndex);
        if (currentFlatIndex === -1) return;

        if (isPlayingSummary) {
            const currentChapter = flattenedChapters[currentFlatIndex];
            loadAndPlay(
                currentChapter.chapter.content,
                selectedChapterIndex,
                -1,
                onAudioEnded,
                currentChapter.chapter.title
            );
        } else {
            const currentVisibleIndex = visibleChapters.findIndex(vc => vc.originalIndex === selectedChapterIndex);
            const nextVisibleIndex = currentVisibleIndex + 1;
            if (nextVisibleIndex < visibleChapters.length) {
                autoPlayOnChapterChangeRef.current = true;
                const nextChapterOriginalIndex = visibleChapters[nextVisibleIndex].originalIndex;
                setSelectedChapterIndex(nextChapterOriginalIndex);
            }
        }
    }, [audioState.trackInfo.chapterTitle, selectedChapterIndex, flattenedChapters, visibleChapters, loadAndPlay]);

    useEffect(() => {
        if (autoPlayOnChapterChangeRef.current && doc) {
            autoPlayOnChapterChangeRef.current = false;
            const currentChapter = flattenedChapters.find(fc => fc.originalIndex === selectedChapterIndex);
            if (currentChapter) {
                 loadAndPlay(
                    currentChapter.chapter.content,
                    selectedChapterIndex,
                    -1,
                    onAudioEnded,
                    currentChapter.chapter.title
                );
            }
        }
    }, [selectedChapterIndex, doc, flattenedChapters, loadAndPlay, onAudioEnded]);
    
    const selectedChapterData = flattenedChapters.find(fc => fc.originalIndex === selectedChapterIndex);

    useEffect(() => {
        const container = contentContainerRef.current;
        if (!container) return;

        const removeHighlights = () => {
            const marks = container.querySelectorAll('mark.cortex-highlight');
            marks.forEach(mark => {
                const parent = mark.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
                    parent.normalize();
                }
            });
        };
        removeHighlights();

        if (!searchQuery.trim() || !doc) {
            return;
        }
        
        const query = searchQuery.trim();
        const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');

        const firstMatchInChapterGlobalIndex = detailedSearchResults.findIndex(r => r.chapterIndex === selectedChapterIndex);
        if (firstMatchInChapterGlobalIndex === -1 && detailedSearchResults.length > 0) {
            return;
        }
        let matchCountInChapter = 0;

        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
        const nodesToProcess: Text[] = [];
        let node;
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
                    if (index % 2 === 1) {
                        const mark = document.createElement('mark');
                        mark.className = 'cortex-highlight';
                        mark.textContent = part;
                        const globalIndex = firstMatchInChapterGlobalIndex + matchCountInChapter;
                        mark.dataset.globalMatchIndex = String(globalIndex);
                        fragment.appendChild(mark);
                        matchCountInChapter++;
                    } else if (part) {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                textNode.parentNode?.replaceChild(fragment, textNode);
            }
        });

        const activeResult = detailedSearchResults[activeSearchResultIndex];
        if (activeResult && activeResult.chapterIndex === selectedChapterIndex) {
            const activeElement = container.querySelector<HTMLElement>(`mark[data-global-match-index="${activeSearchResultIndex}"]`);
            if (activeElement) {
                activeElement.classList.add('active');
                activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [searchQuery, selectedChapterIndex, doc, detailedSearchResults, activeSearchResultIndex]);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!listRef.current || visibleChapters.length === 0 || searchQuery.trim()) return;

            const currentVisibleIndex = visibleChapters.findIndex(vc => vc.originalIndex === (focusedTopicIndex ?? selectedChapterIndex));
            let nextVisibleIndex = currentVisibleIndex;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    nextVisibleIndex = Math.min(visibleChapters.length - 1, currentVisibleIndex + 1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    nextVisibleIndex = Math.max(0, currentVisibleIndex - 1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (focusedTopicIndex !== null) {
                        const chapterToSelect = flattenedChapters.find(fc => fc.originalIndex === focusedTopicIndex);
                        if(chapterToSelect) handleChapterSelect(chapterToSelect.originalIndex);
                    }
                    return;
                default:
                    return;
            }

            if (nextVisibleIndex !== currentVisibleIndex) {
                const nextOriginalIndex = visibleChapters[nextVisibleIndex].originalIndex;
                setFocusedTopicIndex(nextOriginalIndex);
                const itemElement = listRef.current.querySelector(`[data-index="${nextOriginalIndex}"]`);
                itemElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        };

        const listElement = listRef.current;
        listElement?.addEventListener('keydown', handleKeyDown);

        return () => {
            listElement?.removeEventListener('keydown', handleKeyDown);
        };
    }, [focusedTopicIndex, selectedChapterIndex, visibleChapters, searchQuery]);

    useEffect(() => {
      setFocusedTopicIndex(selectedChapterIndex);
    }, [selectedChapterIndex]);

    // Adiciona botões 'Copiar' aos blocos de código após a renderização.
    useEffect(() => {
        const container = contentContainerRef.current;
        if (!container || !selectedChapterData) return;

        // Pequeno atraso para garantir que o DOM de dangerouslySetInnerHTML seja totalmente atualizado.
        const timeoutId = setTimeout(() => {
            const codeBlocks = container.querySelectorAll('pre');

            codeBlocks.forEach(pre => {
                // FIX: Check if pre.parentNode is an Element before accessing classList.
                // The ParentNode type does not guarantee the existence of classList.
                if (pre.parentNode instanceof Element && pre.parentNode.classList.contains('code-block-wrapper')) {
                    return;
                }
                
                const codeEl = pre.querySelector('code');
                // Só adiciona o botão se houver um elemento <code> dentro de <pre>
                if (!codeEl) return;

                const wrapper = document.createElement('div');
                wrapper.className = 'code-block-wrapper';

                const header = document.createElement('div');
                header.className = 'code-block-header';
                
                const button = document.createElement('button');
                button.className = 'copy-code-button';

                const copyIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>`;
                const checkIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>`;

                button.innerHTML = `${copyIconSVG}<span>Copiar</span>`;
                
                button.addEventListener('click', () => {
                    const codeToCopy = codeEl.textContent || '';
                    navigator.clipboard.writeText(codeToCopy).then(() => {
                        button.innerHTML = `${checkIconSVG}<span style="color: #4ade80;">Copiado!</span>`; // Corresponde a text-green-400
                        setTimeout(() => {
                            button.innerHTML = `${copyIconSVG}<span>Copiar</span>`;
                        }, 2000);
                    }).catch(err => {
                        console.error('Falha ao copiar código: ', err);
                        const span = button.querySelector('span');
                        if(span) span.textContent = 'Falhou!';
                    });
                });

                header.appendChild(button);
                
                // Insere o wrapper antes do elemento <pre> e move o <pre> para dentro do wrapper.
                pre.parentNode?.insertBefore(wrapper, pre);
                wrapper.appendChild(header);
                wrapper.appendChild(pre);
            });
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [selectedChapterData]);

    const handleGeneratePlan = async (
        source: { type: 'files'; data: File[] } | { type: 'url'; data: string },
        studyTopic: string,
        additionalTopics: string
    ) => {
        const isSourceInvalid = (source.type === 'files' && source.data.length === 0) || (source.type === 'url' && !source.data.trim());
        if (isSourceInvalid || !studyTopic.trim()) {
            setError("Por favor, forneça uma fonte de estudo (arquivos ou URL) e um tema.");
            return;
        }
    
        setIsLoading(true);
        setError(null);
        setDoc(null);
    
        try {
            let studyPlan;
            if (source.type === 'files') {
                const fileContents = await Promise.all(
                    source.data.map(file => new Promise<{name: string; content: string}>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve({ name: file.name, content: reader.result as string });
                        reader.onerror = (error) => reject(new Error(`Erro ao ler o arquivo ${file.name}: ${error}`));
                        reader.readAsText(file);
                    }))
                );
                studyPlan = await generateStudyPlan({ files: fileContents }, studyTopic, additionalTopics);
            } else { // source.type === 'url'
                studyPlan = await generateStudyPlan({ url: source.data }, studyTopic, additionalTopics);
            }

            setDoc(studyPlan);
            setSelectedChapterIndex(0);
            setFocusedTopicIndex(0);
            setExpandedParentIndex(0);
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
        const chapter = flattenedChapters.find(fc => fc.originalIndex === index);
        if (!chapter) return;
    
        if (chapter.isParent && chapter.level === 0) {
            setExpandedParentIndex(prev => (prev === index ? null : index));
        }

        if (audioState.status === 'playing' || audioState.status === 'paused') {
            autoPlayOnChapterChangeRef.current = true;
        } else {
             autoPlayOnChapterChangeRef.current = false;
        }
        setSelectedChapterIndex(index);
        setSearchQuery('');
    };

    const handleGenerateSummary = async (chapterIndex: number) => {
        const chapterData = flattenedChapters.find(fc => fc.originalIndex === chapterIndex);
        if (!doc || !chapterData) return;
        const { chapter } = chapterData;
        
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

        setSelectedChapterIndex(summaryState.chapterIndex);

        loadAndPlay(
            summaryState.content,
            summaryState.chapterIndex,
            -1,
            onAudioEnded,
            `Resumo: ${summaryState.chapterTitle}`
        );
        
        setSummaryState(prev => ({ ...prev, isModalOpen: false }));
    };

    const navigateToSearchResult = (index: number) => {
        if (index < 0 || index >= detailedSearchResults.length) return;

        const result = detailedSearchResults[index];
        setActiveSearchResultIndex(index);
        
        if (selectedChapterIndex !== result.chapterIndex) {
            setSelectedChapterIndex(result.chapterIndex);
        }
    };

    const handlePreviousResult = () => navigateToSearchResult(activeSearchResultIndex - 1);
    const handleNextResult = () => navigateToSearchResult(activeSearchResultIndex + 1);

    const navigateChapterAudio = (direction: 'next' | 'previous') => {
        const currentVisibleIndex = visibleChapters.findIndex(vc => vc.originalIndex === selectedChapterIndex);
        if (currentVisibleIndex === -1) return;

        const targetVisibleIndex = direction === 'next' ? currentVisibleIndex + 1 : currentVisibleIndex - 1;

        if (targetVisibleIndex >= 0 && targetVisibleIndex < visibleChapters.length) {
            const targetChapter = visibleChapters[targetVisibleIndex];
            if (audioState.status === 'playing' || audioState.status === 'paused') {
                autoPlayOnChapterChangeRef.current = true;
            }
            setSelectedChapterIndex(targetChapter.originalIndex);
        }
    };

    const handlePreviousChapter = () => {
        const isPlayingSummary = audioState.trackInfo.chapterTitle?.startsWith('Resumo:');
    
        // Verifica se estamos reproduzindo um capítulo completo para o qual o último resumo gerado corresponde
        const summaryIsAvailableForCurrentChapter = 
            summaryState.content && 
            summaryState.chapterTitle &&
            summaryState.chapterIndex === selectedChapterIndex;
    
        if (!isPlayingSummary && summaryIsAvailableForCurrentChapter) {
            // Se estiver reproduzindo um capítulo completo e seu resumo estiver disponível, volte a reproduzir o resumo.
            loadAndPlay(
                summaryState.content,
                selectedChapterIndex,
                -1,
                onAudioEnded,
                `Resumo: ${summaryState.chapterTitle}`
            );
        } else {
            // Caso contrário (se estiver reproduzindo um resumo ou um capítulo completo sem um resumo disponível),
            // apenas navegue para o capítulo anterior na lista visível.
            navigateChapterAudio('previous');
        }
    };
    
    const handleNextChapter = () => {
        const isPlayingSummary = audioState.trackInfo.chapterTitle?.startsWith('Resumo:');
        const currentChapter = flattenedChapters.find(fc => fc.originalIndex === selectedChapterIndex);
        
        if (isPlayingSummary && currentChapter) {
            loadAndPlay(
                currentChapter.chapter.content,
                selectedChapterIndex,
                -1,
                onAudioEnded,
                currentChapter.chapter.title
            );
        } else {
            navigateChapterAudio('next');
        }
    };
    
    const Header = () => (
        <header className="relative flex justify-center p-4 sm:p-6 mb-6">
            <div className="w-full max-w-2xl text-center bg-gray-900/30 border border-dashed border-gray-700 rounded-lg p-6 sm:p-8 sm:pt-6 backdrop-blur-sm relative overflow-hidden">
                 <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 animate-pulse"></div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400 flex items-center justify-center gap-2 sm:gap-3 mt-4">
                    <SparklesIcon className="w-8 h-8 sm:w-10 sm:h-10" />
                    Cortex DeepMind
                </h1>
                <p className="text-gray-300 mt-3 text-base sm:text-lg max-w-lg mx-auto">
                    Seu plano de estudo para certificação e estudo livre, turbinado por Agentes IA Autônomos
                </p>
            </div>
        </header>
    );

    const StudyPlanForm = () => {
        const [sourceType, setSourceType] = useState<'files' | 'url'>('files');
        const [files, setFiles] = useState<File[]>([]);
        const [docUrl, setDocUrl] = useState('');
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
            <div className="w-full max-w-3xl mx-auto px-4">
                <form 
                    onSubmit={(e) => { 
                        e.preventDefault(); 
                        const source = sourceType === 'files' ? { type: 'files' as const, data: files } : { type: 'url' as const, data: docUrl };
                        handleGeneratePlan(source, examCode, additionalTopics);
                    }} 
                    className="flex flex-col gap-6 bg-gray-900/50 backdrop-blur-sm p-6 rounded-2xl border border-gray-800"
                >
                    <div>
                        <label className="block text-lg font-semibold mb-3 text-gray-200">1. Adicione seus materiais de estudo</label>
                        <div className="flex mb-3 rounded-lg bg-gray-800 p-1">
                            <button
                                type="button"
                                onClick={() => setSourceType('files')}
                                className={`w-1/2 p-2 rounded-md text-sm font-semibold transition-colors ${sourceType === 'files' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <UploadCloudIcon className="w-5 h-5"/>
                                    <span>Upload de Arquivos</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSourceType('url')}
                                className={`w-1/2 p-2 rounded-md text-sm font-semibold transition-colors ${sourceType === 'url' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                            >
                               <div className="flex items-center justify-center gap-2">
                                    <LinkIcon className="w-5 h-5"/>
                                    <span>Importar de URL</span>
                                </div>
                            </button>
                        </div>

                        {sourceType === 'files' ? (
                            <>
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
                            </>
                        ) : (
                            <div className="p-4 border-2 border-dashed border-gray-600 rounded-lg">
                                <label htmlFor="doc-url" className="sr-only">URL da documentação</label>
                                <div className="relative">
                                     <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                                     <input
                                        id="doc-url" type="url" value={docUrl} onChange={e => setDocUrl(e.target.value)}
                                        placeholder="Ex: https://kubernetes.io/docs/home/"
                                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-md pl-10 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                                        disabled={isLoading}
                                        required={sourceType === 'url'}
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-2 px-1">A IA irá navegar a partir do link inicial para extrair e estruturar a documentação.</p>
                            </div>
                        )}
                    </div>
    
                    <div>
                        <label htmlFor="exam-code" className="block text-lg font-semibold mb-3 text-gray-200">2. Insira o código do exame ou tecnologia para estudo livre</label>
                        <input
                            id="exam-code" type="text" value={examCode} onChange={e => setExamCode(e.target.value)}
                            placeholder="Ex: AZ-104, Kubernetes, React..."
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
    
                    <button type="submit" disabled={isLoading || ((sourceType === 'files' && files.length === 0) || (sourceType === 'url' && !docUrl.trim())) || !examCode.trim()} className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold px-6 py-4 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-300 text-lg shadow-lg shadow-indigo-900/50">
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
    const isPlayingSummary = audioState.trackInfo.chapterTitle?.startsWith('Resumo:');
    
    const currentVisibleIndex = visibleChapters.findIndex(vc => vc.originalIndex === selectedChapterIndex);

    const isNextDisabled = useMemo(() => {
        if (!doc) return true;
        if (isPlayingSummary) return false;
        return currentVisibleIndex >= visibleChapters.length - 1;
    }, [doc, isPlayingSummary, currentVisibleIndex, visibleChapters.length]);

    const isPreviousDisabled = useMemo(() => {
        if (!doc) return true;
        return currentVisibleIndex <= 0;
    }, [doc, currentVisibleIndex]);

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
                                        <h3 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2">{searchQuery.trim() ? 'Resultados da Busca' : 'Tópicos do Plano'}</h3>
                                        <div className="relative mb-2">
                                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 pointer-events-none" />
                                            <input
                                                type="text" placeholder="Buscar no conteúdo..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                                className="w-full bg-gray-800 border border-gray-700 text-white rounded-md pl-10 pr-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition"
                                            />
                                        </div>
                                        {searchQuery.trim() && detailedSearchResults.length > 0 && (
                                            <div className="flex items-center justify-between text-sm text-gray-400 mb-2 px-1">
                                                <span>{detailedSearchResults.length} resultado(s)</span>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={handlePreviousResult} disabled={activeSearchResultIndex <= 0} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                        <ChevronLeftIcon className="w-5 h-5" />
                                                    </button>
                                                    <span>{activeSearchResultIndex + 1} de {detailedSearchResults.length}</span>
                                                    <button onClick={handleNextResult} disabled={activeSearchResultIndex >= detailedSearchResults.length - 1} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                                        <ChevronRightIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        <ul ref={listRef} tabIndex={0} className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md">
                                            {searchQuery.trim() ? (
                                                detailedSearchResults.length > 0 ? (
                                                    detailedSearchResults.map(result => (
                                                        <li key={result.globalIndex}>
                                                            <a
                                                                href="#"
                                                                onClick={(e) => { e.preventDefault(); navigateToSearchResult(result.globalIndex); }}
                                                                className={`block p-3 rounded-lg text-sm transition-all duration-200 ${activeSearchResultIndex === result.globalIndex ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-gray-800'}`}
                                                            >
                                                                <div className="font-semibold text-indigo-300 truncate">{result.chapterTitle}</div>
                                                                <div className="text-xs text-gray-400 mt-1" dangerouslySetInnerHTML={{ __html: result.snippet }} />
                                                            </a>
                                                        </li>
                                                    ))
                                                ) : (
                                                    <li className="p-4 text-center text-gray-500">Nenhum resultado encontrado.</li>
                                                )
                                            ) : (
                                                flattenedChapters.filter(fc => fc.level === 0).map(chapterData => (
                                                    <li key={chapterData.originalIndex}>
                                                        <div
                                                            onClick={() => handleChapterSelect(chapterData.originalIndex)}
                                                            data-index={chapterData.originalIndex}
                                                            className="flex items-center justify-between cursor-pointer group"
                                                        >
                                                            <a
                                                                href="#"
                                                                onClick={(e) => e.preventDefault()}
                                                                className={`flex-grow text-left p-3 rounded-lg text-sm transition-all duration-200 ${selectedChapterIndex === chapterData.originalIndex ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold shadow-md' : 'text-gray-300 hover:bg-gray-800'} ${focusedTopicIndex === chapterData.originalIndex ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-indigo-500' : ''}`}
                                                            >
                                                                {chapterData.chapter.title}
                                                            </a>
                                                            {chapterData.isParent && (
                                                                <ChevronRightIcon className={`w-5 h-5 mr-2 flex-shrink-0 transition-transform ${expandedParentIndex === chapterData.originalIndex ? 'rotate-90' : ''}`} />
                                                            )}
                                                        </div>
                                                        <div className={`grid transition-all duration-300 ease-in-out ${expandedParentIndex === chapterData.originalIndex ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                                            <div className="overflow-hidden">
                                                                <ul className="pl-4 pt-1 space-y-1">
                                                                    {flattenedChapters.filter(fc => fc.parentIndex === chapterData.originalIndex).map(subChapter => (
                                                                         <li key={subChapter.originalIndex} data-index={subChapter.originalIndex} className="flex items-center gap-1 group">
                                                                            <a
                                                                                href="#"
                                                                                onClick={(e) => { e.preventDefault(); handleChapterSelect(subChapter.originalIndex); }}
                                                                                style={{ paddingLeft: `${12}px` }}
                                                                                className={`flex-grow text-left p-2 rounded-lg text-sm transition-all duration-200 ${selectedChapterIndex === subChapter.originalIndex ? 'bg-indigo-700 text-white font-semibold' : 'text-gray-400 hover:bg-gray-800'} ${focusedTopicIndex === subChapter.originalIndex ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-indigo-500' : ''}`}
                                                                            >
                                                                                {subChapter.chapter.title}
                                                                            </a>
                                                                         </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))
                                            )}
                                        </ul>
                                    </div>
                                </aside>
                            )}
                            <article ref={contentContainerRef} className={`${isFocusMode ? 'h-screen overflow-y-auto' : 'lg:col-span-8 xl:col-span-9 min-h-[70vh]'} bg-gray-900/50 backdrop-blur-sm rounded-lg p-6 border border-gray-800`}>
                                {selectedChapterData && (
                                    <>
                                        <div className="mb-6 pb-4 border-b border-gray-700">
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">{selectedChapterData.chapter.title}</h3>
                                                {!isFocusMode && (
                                                    <button onClick={() => setIsFocusMode(true)} className="p-2 rounded-full text-gray-400 hover:bg-gray-700 transition-colors" title="Modo Focado">
                                                        <ArrowsPointingOutIcon className="w-6 h-6" />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4 mb-4 flex-wrap">
                                                <button onClick={handlePreviousChapter} disabled={isPreviousDisabled} className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition">
                                                    <ChevronLeftIcon className="w-4 h-4"/> <span>Anterior</span>
                                                </button>
                                                <button onClick={handleNextChapter} disabled={isNextDisabled} className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition">
                                                    <span>Próximo</span> <ChevronRightIcon className="w-4 h-4"/>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (selectedChapterData) {
                                                            loadAndPlay(
                                                                selectedChapterData.chapter.content,
                                                                selectedChapterIndex,
                                                                -1,
                                                                onAudioEnded,
                                                                selectedChapterData.chapter.title
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
                                                 <button onClick={() => handleGenerateSummary(selectedChapterIndex)} disabled={summaryState.isLoading && summaryState.chapterIndex === selectedChapterIndex} className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-sm font-medium disabled:opacity-50 disabled:cursor-wait transition" title="Gerar resumo do tópico">
                                                    {summaryState.isLoading && summaryState.chapterIndex === selectedChapterIndex ? <LoaderIcon className="w-4 h-4 animate-spin" /> : <DocumentTextIcon className="w-4 h-4" />}
                                                    <span>Resumir</span>
                                                </button>
                                            </div>

                                            <div className={`prose prose-invert max-w-none prose-pre:bg-gray-900 prose-pre:rounded-md prose-pre:border prose-pre:border-gray-700 prose-img:rounded-md prose-a:text-indigo-400 hover:prose-a:text-indigo-300 prose-strong:text-gray-100`}>
                                                <div className={`${isFocusMode ? 'max-w-3xl mx-auto py-8' : ''}`}>
                                                    <div className="select-text" dangerouslySetInnerHTML={{ __html: converter.makeHtml(selectedChapterData.chapter.content) }}/>
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
                onSeek={seekTo}
                onVolumeChange={handleVolumeChange}
                onMuteToggle={handleMuteToggle}
                onSpeedChange={handleSpeedChange}
                onNext={handleNextChapter}
                onPrevious={handlePreviousChapter}
                isNextDisabled={isNextDisabled}
                isPreviousDisabled={isPreviousDisabled}
            />
            {!isFocusMode && <Footer />}
        </div>
    );
}