import React, { useState, useEffect } from 'react';
import { Book, getBook, saveBook, updateBookProgress, BookmarkPin, Highlight, StickyNote } from '../lib/db';
import { loadPdf, renderPdfPage, extractPdfText, getPdfTextContent } from '../lib/pdf';
import * as pdfjsLib from 'pdfjs-dist';
import { BookFlip } from './BookFlip';
import { Book3D } from './Book3D';
import { ArrowLeft, Moon, Sun, ZoomIn, ZoomOut, MessageSquare, Loader2, Maximize2, Minimize2, Settings2, Type, AlignLeft, Paperclip, RotateCcw, RotateCw, Highlighter, X, StickyNote as StickyNoteIcon, Sparkles, Send } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence, useMotionValue, useMotionTemplate } from 'framer-motion';
import { cn } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';

const PIN_COLORS = ['#606C38', '#283618', '#FEFAE0', '#DDA15E', '#BC6C25', '#8c4a4a'];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const Reader = ({ bookId, onBack }: { bookId: string; onBack: () => void }) => {
  const [book, setBook] = useState<Book | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfAspectRatio, setPdfAspectRatio] = useState<number>(1 / 1.4); // Default aspect ratio
  const [currentPage, setCurrentPage] = useState(0);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [zoom, setZoom] = useState(1);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'ai' | 'bookmarks' | 'highlights'>('ai');
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // New Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [isTextMode, setIsTextMode] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [lineSpacing, setLineSpacing] = useState(1.6);
  const [brightness, setBrightness] = useState(100);
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
  const [pageTextContent, setPageTextContent] = useState<Record<number, any>>({});
  const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number, text: string } | null>(null);

  // Bookmark Pins State
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [selectedPinColor, setSelectedPinColor] = useState<string | null>(null);
  const [trayRotation, setTrayRotation] = useState(0);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Highlighter State
  const [isHighlightMode, setIsHighlightMode] = useState(false);
  const [highlightColor, setHighlightColor] = useState('#DDA15E'); // Default Earth Yellow

  // Sticky Note State
  const [isStickyMode, setIsStickyMode] = useState(false);
  const [stickyColor, setStickyColor] = useState('#DDA15E');
  const [activeStickyId, setActiveStickyId] = useState<string | null>(null);
  const [isBookOpening, setIsBookOpening] = useState(true);

  const getShortTitle = (title: string) => {
    // Knowledge-based shortening: Remove common fluff
    let short = title
      .replace(/\b(A|The|An)\b/gi, '') // Remove articles at start/middle
      .replace(/\b(Novel|Edition|Volume|Vol|Book|Part|Chapter)\b.*$/gi, '') // Remove "A Novel", "Vol 1" etc
      .replace(/[:\-\(\[].*$/g, '') // Remove subtitles
      .trim();

    const words = short.split(/\s+/);
    if (words.length > 3) {
      // If still too long, take first 3 words
      return words.slice(0, 3).join(' ');
    }
    return short || title.split(' ')[0]; // Fallback to first word of original
  };

  const [drawingHighlight, setDrawingHighlight] = useState<{
    page: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const pinTransform = useMotionTemplate`translate(calc(${mouseX}px - 10px), calc(${mouseY}px - 10px)) rotate(15deg)`;
  const stickyTransform = useMotionTemplate`translate(calc(${mouseX}px - 10px), calc(${mouseY}px - 10px))`;
  const highlightTransform = useMotionTemplate`translate(${mouseX}px, ${mouseY}px)`;

  useEffect(() => {
    if (!selectedPinColor && !isHighlightMode && !isStickyMode) return;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [selectedPinColor, isHighlightMode, isStickyMode, mouseX, mouseY]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPinColor(null);
        setIsTrayOpen(false);
        setIsHighlightMode(false);
        setIsStickyMode(false);
        setDrawingHighlight(null);
        setActiveStickyId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const handleMouseMove = () => {
      setShowToolbar(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!aiPanelOpen && !showSettings) setShowToolbar(false);
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, [aiPanelOpen, showSettings]);

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
        // If in highlight mode, don't show menu, just highlight
        if (isHighlightMode) return;

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectionMenu({
          x: rect.left + rect.width / 2,
          y: rect.top,
          text: selection.toString().trim()
        });
      } else {
        setSelectionMenu(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleHighlightSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !book) return;

    const range = selection.getRangeAt(0);
    const textLayer = range.commonAncestorContainer.parentElement?.closest('[data-page-index]');
    if (!textLayer) return;

    const pageIndex = parseInt(textLayer.getAttribute('data-page-index') || '0');
    const containerRect = textLayer.getBoundingClientRect();
    const rects = range.getClientRects();
    const newHighlights: Highlight[] = [];
    const text = selection.toString().trim();

    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const x = ((rect.left - containerRect.left) / containerRect.width) * 100;
      const y = ((rect.top - containerRect.top) / containerRect.height) * 100;
      const width = (rect.width / containerRect.width) * 100;
      const height = (rect.height / containerRect.height) * 100;

      if (width > 0.1 && height > 0.1) {
        newHighlights.push({
          id: uuidv4(),
          page: pageIndex,
          x,
          y,
          width,
          height,
          color: highlightColor,
          text
        });
      }
    }

    if (newHighlights.length > 0) {
      const updatedBook = {
        ...book,
        highlights: [...(book.highlights || []), ...newHighlights]
      };
      setBook(updatedBook);
      saveBook(updatedBook);
      selection.removeAllRanges();
      setSelectionMenu(null);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const init = async () => {
      const b = await getBook(bookId);
      if (b) {
        setBook(b);
        setCurrentPage(b.currentPage);
        if (b.fileData) {
          const pdf = await loadPdf(b.fileData);
          setPdfDoc(pdf);
          
          try {
            const firstPage = await pdf.getPage(1);
            const viewport = firstPage.getViewport({ scale: 1 });
            setPdfAspectRatio(viewport.width / viewport.height);

            // Extract metadata if missing
            if (!b.author || b.title === 'Untitled' || b.title.includes('.pdf')) {
              const text = await extractPdfText(pdf, 1);
              const text2 = b.totalPages > 1 ? await extractPdfText(pdf, 2) : '';
              
              const prompt = `Analyze the following text from the first two pages of a book and extract the Title and Author. Return ONLY a JSON object like {"title": "...", "author": "..."}. If not found, use best guess. Text: ${text}\n${text2}`;
              
              const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite-preview',
                contents: prompt,
                config: { responseMimeType: 'application/json' }
              });

              try {
                const metadata = JSON.parse(response.text || '{}');
                if (metadata.title || metadata.author) {
                  const updatedBook = { 
                    ...b, 
                    title: metadata.title || b.title, 
                    author: metadata.author || b.author 
                  };
                  setBook(updatedBook);
                  saveBook(updatedBook);
                }
              } catch (e) {
                console.error('Failed to parse metadata', e);
              }
            }
          } catch (e) {
            console.error('Failed to get aspect ratio or metadata', e);
          }
        } else {
          alert('This book was uploaded on another device. Please re-upload the PDF to read it here.');
          onBack();
        }
      }
    };
    init();
  }, [bookId]);

  useEffect(() => {
    if (!pdfDoc || !book) return;
    
    // Preload current, previous, and next pages
    const pagesToLoad = [
      currentPage - 2, currentPage - 1, 
      currentPage, currentPage + 1, 
      currentPage + 2, currentPage + 3
    ].filter(p => p >= 0 && p < book.totalPages);

    pagesToLoad.forEach(async (p) => {
      // Load Images
      if (!pageImages[p]) {
        try {
          // PDF pages are 1-indexed
          const imgUrl = await renderPdfPage(pdfDoc, p + 1, book.id);
          setPageImages(prev => ({ ...prev, [p]: imgUrl }));
        } catch (e) {
          console.error('Failed to render page', p, e);
        }
      }
      
      // Load Text for Text Mode
      if (isTextMode && !pageTexts[p]) {
        try {
          const text = await extractPdfText(pdfDoc, p + 1);
          setPageTexts(prev => ({ ...prev, [p]: text }));
        } catch (e) {
          console.error('Failed to extract text', p, e);
        }
      }

      // Load Text Content for Highlighting
      if (!pageTextContent[p]) {
        try {
          const content = await getPdfTextContent(pdfDoc, p + 1);
          setPageTextContent(prev => ({ ...prev, [p]: content }));
        } catch (e) {
          console.error('Failed to get text content', p, e);
        }
      }
    });
  }, [currentPage, pdfDoc, book, pageImages, pageTexts, pageTextContent, isTextMode]);

  const handlePageChange = async (newPage: number) => {
    setCurrentPage(newPage);
    if (book) {
      const now = Date.now();
      const updatedBook = { ...book, currentPage: newPage, lastOpened: now };
      setBook(updatedBook);
      try {
        await updateBookProgress(book.id, newPage, now);
      } catch (err) {
        console.error('Failed to update book progress:', err);
      }
    }
  };

  // Auto-save progress periodically in the background
  useEffect(() => {
    if (!book) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      setBook(prev => prev ? { ...prev, lastOpened: now } : prev);
      updateBookProgress(book.id, currentPage, now).catch(err => {
        console.error('Failed to auto-save progress:', err);
      });
    }, 30000); // Auto-save every 30 seconds

    return () => clearInterval(intervalId);
  }, [book?.id, currentPage]);

  const handleAskAi = async (queryOverride?: string) => {
    const queryToUse = queryOverride || aiQuery;
    if (!queryToUse.trim() || !pdfDoc) return;
    setIsAiLoading(true);
    setAiResponse('');
    
    try {
      // Extract text from current visible pages
      const leftText = currentPage - 1 >= 0 ? await extractPdfText(pdfDoc, currentPage) : '';
      const rightText = currentPage < book!.totalPages ? await extractPdfText(pdfDoc, currentPage + 1) : '';
      const contextText = `${leftText}\n\n${rightText}`;

      const prompt = `Context from the current pages of the book:\n"""\n${contextText}\n"""\n\nUser Question: ${queryToUse}\n\nPlease answer the user's question based on the context provided. If the answer is not in the context, say so.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
      });

      setAiResponse(response.text || 'No response generated.');
    } catch (error) {
      console.error('AI Error:', error);
      setAiResponse('Sorry, there was an error processing your request.');
    } finally {
      setIsAiLoading(false);
    }
  };

  if (!book || !pdfDoc || isBookOpening) {
    const shortTitle = book ? getShortTitle(book.title) : 'FLIPVERSE';
    
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-12 p-8 relative overflow-hidden">
        <div className="noise-overlay" />
        
        <AnimatePresence mode="wait">
          <motion.div
            key="book-intro"
            initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            exit={{ 
              opacity: 0, 
              scale: 1.5, 
              rotateY: 90,
              z: 500,
              filter: 'blur(30px)',
              transition: { duration: 1.2, ease: [0.43, 0.13, 0.23, 0.96] }
            }}
            className="flex flex-col items-center gap-12 z-10 perspective-[2000px]"
          >
            {book && (
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                }}
                transition={{ 
                  duration: 6, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
              >
                <Book3D 
                  title={shortTitle} 
                  author={book.author} 
                  coverImage={pageImages[0] || book.coverUrl}
                  onOpen={() => setIsBookOpening(false)}
                  isLoading={!pdfDoc}
                />
              </motion.div>
            )}

            <div className="space-y-6 text-center max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h1 className="text-5xl font-display tracking-tighter text-white-soft uppercase leading-none">
                  {book?.title || 'FLIPVERSE'}
                </h1>
                {book?.author && (
                  <p className="text-accent text-sm font-display uppercase tracking-[0.4em] mt-4 opacity-60">
                    By {book.author}
                  </p>
                )}
              </motion.div>

              {!pdfDoc ? (
                <div className="flex flex-col items-center gap-6">
                  <div className="flex items-center gap-3 text-accent text-[10px] uppercase tracking-[0.4em] font-bold">
                    <div className="flex gap-1">
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 h-1 bg-accent rounded-full" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 h-1 bg-accent rounded-full" />
                      <motion.div animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 h-1 bg-accent rounded-full" />
                    </div>
                    Synchronizing Neural Archive
                  </div>
                  <div className="w-64 h-0.5 bg-white-soft/5 rounded-full overflow-hidden relative">
                    <motion.div 
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-accent to-transparent"
                    />
                  </div>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex flex-col items-center gap-8"
                >
                  <motion.button
                    whileHover={{ scale: 1.05, letterSpacing: '0.4em' }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsBookOpening(false)}
                    className="group relative px-12 py-5 overflow-hidden rounded-full border border-accent/30 text-accent text-[10px] font-bold uppercase tracking-[0.3em] transition-all"
                  >
                    <div className="absolute inset-0 bg-accent/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                    <span className="relative z-10">Initialize Reader</span>
                  </motion.button>
                  
                  <div className="flex items-center gap-8 opacity-30">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[8px] font-mono uppercase tracking-widest">Pages</span>
                      <span className="text-xs font-display font-bold">{book.totalPages}</span>
                    </div>
                    <div className="w-px h-6 bg-white-soft/20" />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[8px] font-mono uppercase tracking-widest">Format</span>
                      <span className="text-xs font-display font-bold">PDF-X</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Immersive Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, 5, 0],
              opacity: [0.03, 0.06, 0.03]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,_var(--color-accent)_0%,_transparent_50%)] blur-[120px]" 
          />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.02] mix-blend-overlay" />
        </div>
      </div>
    );
  }

  const renderPage = (index: number) => {
    if (index < 0 || index >= book.totalPages) return null;
    
    const handlePageClick = (e: React.MouseEvent) => {
      if (!book) return;
      
      if (isStickyMode) {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        const newSticky: StickyNote = {
          id: uuidv4(),
          page: index,
          x,
          y,
          text: '',
          color: stickyColor
        };

        const updatedBook = {
          ...book,
          stickyNotes: [...(book.stickyNotes || []), newSticky]
        };

        setBook(updatedBook);
        saveBook(updatedBook);
        setActiveStickyId(newSticky.id);
        setIsStickyMode(false); // Turn off sticky mode after placing one
        return;
      }

      if (!selectedPinColor) return;
      e.stopPropagation();

      const rect = e.currentTarget.getBoundingClientRect();
      let x = ((e.clientX - rect.left) / rect.width) * 100;
      let y = ((e.clientY - rect.top) / rect.height) * 100;

      // Snap to edges if close (within 10%)
      const threshold = 10;
      if (x < threshold) x = 0;
      else if (x > 100 - threshold) x = 100;
      
      if (y < threshold) y = 0;
      else if (y > 100 - threshold) y = 100;

      const newPin: BookmarkPin = {
        id: uuidv4(),
        page: index,
        x,
        y,
        color: selectedPinColor
      };

      const updatedBook = {
        ...book,
        pins: [...(book.pins || []), newPin]
      };

      setBook(updatedBook);
      saveBook(updatedBook);
    };

    const handleTextSelection = (e: React.MouseEvent) => {
      if (!isHighlightMode || !book) return;
      
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const range = selection.getRangeAt(0);
      const rects = range.getClientRects();
      const containerRect = e.currentTarget.getBoundingClientRect();

      const newHighlights: Highlight[] = [];

      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        const x = ((rect.left - containerRect.left) / containerRect.width) * 100;
        const y = ((rect.top - containerRect.top) / containerRect.height) * 100;
        const width = (rect.width / containerRect.width) * 100;
        const height = (rect.height / containerRect.height) * 100;

        if (width > 0.1 && height > 0.1) {
          newHighlights.push({
            id: uuidv4(),
            page: index,
            x,
            y,
            width,
            height,
            color: highlightColor
          });
        }
      }

      if (newHighlights.length > 0) {
        const updatedBook = {
          ...book,
          highlights: [...(book.highlights || []), ...newHighlights]
        };
        setBook(updatedBook);
        saveBook(updatedBook);
        selection.removeAllRanges();
      }
    };

    const pagePins = (book.pins || []).filter(p => p.page === index);
    const pageHighlights = (book.highlights || []).filter(h => h.page === index);
    const pageStickyNotes = (book.stickyNotes || []).filter(s => s.page === index);
    const imgUrl = pageImages[index];

    return (
      <div 
        className={cn(
          "w-full h-full relative overflow-hidden transition-colors duration-500",
          theme === 'dark' ? 'bg-background' : 'bg-white-soft',
          selectedPinColor ? 'cursor-crosshair' : '',
          isHighlightMode ? 'cursor-text' : '',
          isStickyMode ? 'cursor-crosshair' : ''
        )}
        onClick={handlePageClick}
      >
        {isTextMode ? (
          <div 
            className={cn(
              "w-full h-full p-8 sm:p-12 overflow-y-auto transition-colors duration-500",
              theme === 'dark' ? 'bg-background text-white-soft' : 'bg-white-soft text-background'
            )}
            style={{ 
              fontSize: `${fontSize}px`, 
              lineHeight: lineSpacing,
              fontFamily: 'var(--font-sans)'
            }}
          >
            {pageTexts[index] !== undefined ? (
              <div className="whitespace-pre-wrap pb-24 max-w-2xl mx-auto">{pageTexts[index]}</div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-accent animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4">
            {imgUrl ? (
              <div className="relative max-w-full max-h-full shadow-2xl" style={{ aspectRatio: pdfAspectRatio }}>
                <img 
                  src={imgUrl} 
                  alt={`Page ${index + 1}`} 
                  className={cn(
                    "w-full h-full object-contain pointer-events-none select-none transition-all duration-500",
                    theme === 'dark' ? 'brightness-90 contrast-110' : ''
                  )}
                  style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s ease' }}
                />
                
                {/* Text Layer for Selection */}
                {pageTextContent[index] && (
                  <div 
                    data-page-index={index}
                    className={cn(
                      "absolute inset-0 z-30 transition-opacity",
                      isHighlightMode ? "select-text cursor-text opacity-100" : "pointer-events-none select-none opacity-0"
                    )}
                    onMouseUp={handleTextSelection}
                    style={{ transform: `scale(${zoom})`, transition: 'transform 0.3s ease' }}
                  >
                    {pageTextContent[index].items.map((item: any, i: number) => {
                      const { transform, width, height, str } = item;
                      const { width: pageWidth, height: pageHeight } = pageTextContent[index].viewport;
                      
                      const left = (transform[4] / pageWidth) * 100;
                      const bottom = (transform[5] / pageHeight) * 100;
                      const fontSize = transform[0];
                      const itemWidth = (width / pageWidth) * 100;
                      const itemHeight = (height / pageHeight) * 100;

                      return (
                        <span
                          key={i}
                          className="absolute whitespace-pre"
                          style={{
                            left: `${left}%`,
                            bottom: `${bottom}%`,
                            fontSize: `${fontSize}px`,
                            width: `${itemWidth}%`,
                            height: `${itemHeight}%`,
                            transform: `scaleY(-1)`,
                            transformOrigin: 'bottom left',
                            color: 'transparent',
                          }}
                        >
                          {str}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <Loader2 className="w-8 h-8 text-accent animate-spin" />
            )}
          </div>
        )}

        <div className={cn(
          "absolute bottom-4 left-0 right-0 flex items-center justify-between px-10 text-[10px] font-mono pointer-events-none transition-colors duration-500",
          theme === 'dark' ? 'text-gray-light/40' : 'text-gray-mid/60'
        )}>
          <span className="truncate max-w-[150px] uppercase tracking-[0.2em] font-display">{book.title}</span>
          <span className="font-mono">{index + 1}</span>
        </div>

        {/* Render Highlights */}
        {pageHighlights.map(highlight => (
          <div
            key={highlight.id}
            className="absolute mix-blend-multiply group z-40"
            style={{ 
              left: `${highlight.x}%`, 
              top: `${highlight.y}%`, 
              width: `${highlight.width}%`, 
              height: `${highlight.height}%`, 
              backgroundColor: highlight.color,
              opacity: 0.4,
              borderRadius: '2px',
              boxShadow: `0 0 5px ${highlight.color}40`,
              transform: 'rotate(-0.2deg)' // Slight rotation for organic feel
            }}
          >
            <button
              className="absolute -top-6 right-0 bg-background/90 border border-white-soft/10 text-accent p-1 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:scale-110 active:scale-95 shadow-xl z-50"
              onClick={(e) => {
                e.stopPropagation();
                const updatedBook = { ...book, highlights: book.highlights!.filter(h => h.id !== highlight.id) };
                setBook(updatedBook);
                saveBook(updatedBook);
              }}
              title="Remove Highlight"
            >
              <X className="w-3 h-3" strokeWidth={2} />
            </button>
          </div>
        ))}

        {/* Render Drawing Highlight */}
        {drawingHighlight && drawingHighlight.page === index && (
          <div
            className="absolute mix-blend-multiply pointer-events-none z-40"
            style={{ 
              left: `${Math.min(drawingHighlight.startX, drawingHighlight.currentX)}%`, 
              top: `${Math.min(drawingHighlight.startY, drawingHighlight.currentY)}%`, 
              width: `${Math.abs(drawingHighlight.currentX - drawingHighlight.startX)}%`, 
              height: `${Math.abs(drawingHighlight.currentY - drawingHighlight.startY)}%`, 
              backgroundColor: highlightColor,
              opacity: 0.4
            }}
          />
        )}

        {/* Render Pins */}
        {pagePins.map(pin => {
          const isAtLeft = pin.x === 0;
          const isAtRight = pin.x === 100;
          const isAtTop = pin.y === 0;
          const isAtBottom = pin.y === 100;
          const isOnEdge = isAtLeft || isAtRight || isAtTop || isAtBottom;

          return (
            <div
              key={pin.id}
              className={cn(
                "absolute z-50 cursor-pointer hover:scale-110 transition-transform group",
                !isOnEdge && "hover:rotate-12"
              )}
              style={{ 
                left: `${pin.x}%`, 
                top: `${pin.y}%`, 
                transform: isAtLeft ? 'translate(-30%, -50%) rotate(-90deg)' :
                           isAtRight ? 'translate(-70%, -50%) rotate(90deg)' :
                           isAtTop ? 'translate(-50%, -30%) rotate(0deg)' :
                           isAtBottom ? 'translate(-50%, -70%) rotate(180deg)' :
                           'translate(-50%, -50%) rotate(15deg)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                const updatedBook = { ...book, pins: book.pins!.filter(p => p.id !== pin.id) };
                setBook(updatedBook);
                saveBook(updatedBook);
              }}
            >
              <div className="relative">
                <Paperclip 
                  className={cn(
                    "w-8 h-8 drop-shadow-lg",
                    isOnEdge ? "opacity-100" : "opacity-90"
                  )} 
                  style={{ color: pin.color }} 
                />
                {/* Physical paperclip detail */}
                <div 
                  className="absolute inset-0 border-2 border-zinc-50/20 rounded-full pointer-events-none" 
                  style={{ opacity: 0.3 }}
                />
              </div>
              <div className={cn(
                "absolute bg-red-500 text-zinc-50 text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[60]",
                isAtTop ? "top-full mt-2 left-1/2 -translate-x-1/2" :
                isAtBottom ? "bottom-full mb-2 left-1/2 -translate-x-1/2" :
                isAtLeft ? "left-full ml-2 top-1/2 -translate-y-1/2" :
                "right-full mr-2 top-1/2 -translate-y-1/2"
              )}>
                Remove Pin
              </div>
            </div>
          );
        })}

        {/* Render Sticky Notes */}
        {pageStickyNotes.map(sticky => (
          <div
            key={sticky.id}
            className="absolute z-50 group"
            style={{ left: `${sticky.x}%`, top: `${sticky.y}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              className="relative cursor-pointer hover:scale-110 transition-transform"
              onClick={() => setActiveStickyId(activeStickyId === sticky.id ? null : sticky.id)}
            >
              <StickyNoteIcon className="w-8 h-8 drop-shadow-md" style={{ color: sticky.color, fill: sticky.color }} />
              <button
                className="absolute -top-2 -right-2 bg-red-500 text-zinc-50 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  const updatedBook = { ...book, stickyNotes: book.stickyNotes!.filter(s => s.id !== sticky.id) };
                  setBook(updatedBook);
                  saveBook(updatedBook);
                  if (activeStickyId === sticky.id) setActiveStickyId(null);
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            
            <AnimatePresence>
              {activeStickyId === sticky.id && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 10 }}
                  className="absolute top-full left-0 mt-2 w-64 p-3 rounded-lg shadow-xl border border-zinc-200/20 backdrop-blur-md"
                  style={{ backgroundColor: `${sticky.color}dd` }}
                >
                  <textarea
                    autoFocus
                    className="w-full h-32 bg-transparent border-none resize-none focus:outline-none text-zinc-900 placeholder:text-zinc-900/50"
                    placeholder="Type your note here..."
                    value={sticky.text}
                    onChange={(e) => {
                      const updatedNotes = book.stickyNotes!.map(s => 
                        s.id === sticky.id ? { ...s, text: e.target.value } : s
                      );
                      const updatedBook = { ...book, stickyNotes: updatedNotes };
                      setBook(updatedBook);
                      saveBook(updatedBook);
                    }}
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => {
                        const query = `Explain this note: ${sticky.text}`;
                        setAiQuery(query);
                        setAiPanelOpen(true);
                        handleAskAi(query);
                      }}
                      className="text-xs bg-zinc-50/30 hover:bg-zinc-50/50 text-zinc-900 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" /> Explain
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "min-h-screen flex flex-col transition-colors duration-700 relative overflow-hidden",
        theme === 'dark' ? 'bg-background text-white-soft' : 'bg-white-soft text-background'
      )}
    >
      <div className="noise-overlay" />
      
      {/* Toolbar */}
      <AnimatePresence>
        {showToolbar && (
          <motion.header 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className={cn(
              "h-16 px-6 flex items-center justify-between border-b backdrop-blur-xl fixed top-0 left-0 right-0 z-50",
              theme === 'dark' ? 'border-white-soft/5 bg-background/80' : 'border-background/5 bg-white-soft/80'
            )}
          >
            <div className="flex items-center gap-4">
              <button onClick={onBack} className={cn(
                "p-2.5 rounded-full transition-all active:scale-95",
                theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
              )}>
                <ArrowLeft className="w-5 h-5" strokeWidth={1.5} />
              </button>
              <h1 className="font-display font-bold truncate max-w-xs text-lg tracking-tight uppercase">{book.title}</h1>
            </div>
            
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button onClick={() => setShowSettings(!showSettings)} className={cn(
                  "p-2.5 rounded-full transition-all active:scale-95",
                  showSettings ? 'bg-accent text-background shadow-lg shadow-accent/20' : theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
                )}>
                  <Settings2 className="w-4 h-4" strokeWidth={1.5} />
                </button>
                
                <AnimatePresence>
                  {showSettings && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className={cn(
                        "absolute top-full right-0 mt-4 w-72 p-5 rounded-2xl shadow-2xl border backdrop-blur-xl z-50 flex flex-col gap-6",
                        theme === 'dark' ? 'bg-gray-mid border-white-soft/10' : 'bg-white-soft border-background/5'
                      )}
                    >
                      {/* Text Mode Toggle */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold font-display uppercase tracking-widest">Reader Mode</span>
                        <button 
                          onClick={() => setIsTextMode(!isTextMode)}
                          className={cn(
                            "w-12 h-6 rounded-full transition-colors relative",
                            isTextMode ? 'bg-accent' : 'bg-gray-light/30'
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full bg-white-soft absolute top-1 transition-all",
                            isTextMode ? 'left-7' : 'left-1'
                          )} />
                        </button>
                      </div>

                      {/* Brightness Slider */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[10px] text-gray-light font-display uppercase tracking-widest font-bold">
                          <span className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5" strokeWidth={1.5} /> Brightness</span>
                          <span>{brightness}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="50" max="150" 
                          value={brightness} 
                          onChange={e => setBrightness(Number(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>

                      {/* Font Size Slider */}
                      <div className={`space-y-3 transition-opacity ${!isTextMode ? 'opacity-40 pointer-events-none' : ''}`}>
                        <div className="flex items-center justify-between text-[10px] text-gray-light font-display uppercase tracking-widest font-bold">
                          <span className="flex items-center gap-1.5"><Type className="w-3.5 h-3.5" strokeWidth={1.5} /> Font Size</span>
                          <span>{fontSize}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="12" max="32" 
                          value={fontSize} 
                          onChange={e => setFontSize(Number(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>

                      {/* Line Spacing Slider */}
                      <div className={`space-y-3 transition-opacity ${!isTextMode ? 'opacity-40 pointer-events-none' : ''}`}>
                        <div className="flex items-center justify-between text-[10px] text-gray-light font-display uppercase tracking-widest font-bold">
                          <span className="flex items-center gap-1.5"><AlignLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Line Spacing</span>
                          <span>{lineSpacing}x</span>
                        </div>
                        <input 
                          type="range" 
                          min="1" max="2.5" step="0.1"
                          value={lineSpacing} 
                          onChange={e => setLineSpacing(Number(e.target.value))}
                          className="w-full accent-accent"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className={cn(
                "w-px h-4 mx-2",
                theme === 'dark' ? 'bg-white-soft/10' : 'bg-background/10'
              )} />

              <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} disabled={isTextMode} className={cn(
                "p-2.5 rounded-full transition-all active:scale-95 disabled:opacity-30",
                theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
              )}>
                <ZoomOut className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <span className={cn(
                "text-[10px] font-mono w-12 text-center opacity-70",
                isTextMode ? 'opacity-30' : ''
              )}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} disabled={isTextMode} className={cn(
                "p-2.5 rounded-full transition-all active:scale-95 disabled:opacity-30",
                theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
              )}>
                <ZoomIn className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <div className={cn(
                "w-px h-4 mx-2",
                theme === 'dark' ? 'bg-white-soft/10' : 'bg-background/10'
              )} />
              <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className={cn(
                "p-2.5 rounded-full transition-all active:scale-95",
                theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
              )}>
                {theme === 'light' ? <Moon className="w-4 h-4" strokeWidth={1.5} /> : <Sun className="w-4 h-4" strokeWidth={1.5} />}
              </button>
              <button onClick={toggleFullscreen} className={cn(
                "p-2.5 rounded-full transition-all active:scale-95",
                theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
              )}>
                {isFullscreen ? <Minimize2 className="w-4 h-4" strokeWidth={1.5} /> : <Maximize2 className="w-4 h-4" strokeWidth={1.5} />}
              </button>
              <button onClick={() => setAiPanelOpen(!aiPanelOpen)} className={cn(
                "p-2.5 rounded-full transition-all active:scale-95 ml-2",
                aiPanelOpen ? 'bg-accent text-background shadow-lg shadow-accent/20' : theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
              )}>
                <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <button 
                onClick={() => {
                  setIsHighlightMode(!isHighlightMode);
                  if (!isHighlightMode) {
                    setSelectedPinColor(null);
                    setIsTrayOpen(false);
                    setIsStickyMode(false);
                  }
                }} 
                className={cn(
                  "p-2.5 rounded-full transition-all active:scale-95",
                  isHighlightMode ? 'bg-accent text-background shadow-lg shadow-accent/20' : theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
                )}
              >
                <Highlighter className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <button 
                onClick={() => {
                  setIsStickyMode(!isStickyMode);
                  if (!isStickyMode) {
                    setSelectedPinColor(null);
                    setIsTrayOpen(false);
                    setIsHighlightMode(false);
                  }
                }} 
                className={cn(
                  "p-2.5 rounded-full transition-all active:scale-95",
                  isStickyMode ? 'bg-accent text-background shadow-lg shadow-accent/20' : theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
                )}
              >
                <StickyNoteIcon className="w-4 h-4" strokeWidth={1.5} />
              </button>

              {/* Color Selection for Active Tool */}
              {(isStickyMode || isHighlightMode) && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "flex items-center gap-1.5 ml-2 px-2 py-1 rounded-full border",
                    theme === 'dark' ? 'bg-white-soft/5 border-white-soft/10' : 'bg-background/5 border-background/10'
                  )}
                >
                  {PIN_COLORS.map(color => (
                    <button
                      key={color}
                      onClick={() => isStickyMode ? setStickyColor(color) : setHighlightColor(color)}
                      className={cn(
                        "w-4 h-4 rounded-full border border-background/20 transition-transform hover:scale-125",
                        (isStickyMode ? stickyColor === color : highlightColor === color) && "ring-2 ring-accent ring-offset-2 ring-offset-background"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </motion.div>
              )}

              <button 
                onClick={() => {
                  setIsTrayOpen(!isTrayOpen);
                  if (!isTrayOpen) {
                    setIsHighlightMode(false);
                    setIsStickyMode(false);
                  }
                  if (isTrayOpen) setSelectedPinColor(null);
                }} 
                className={cn(
                  "p-2.5 rounded-full transition-all active:scale-95",
                  isTrayOpen || selectedPinColor ? 'bg-accent text-background shadow-lg shadow-accent/20' : theme === 'dark' ? 'hover:bg-white-soft/10 text-white-soft' : 'hover:bg-background/5 text-background'
                )}
              >
                <Paperclip className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Floating Pin Cursor */}
      {selectedPinColor && (
        <motion.div
          className="fixed pointer-events-none z-[100] drop-shadow-2xl"
          style={{ left: 0, top: 0, transform: pinTransform }}
        >
          <Paperclip className="w-8 h-8" style={{ color: selectedPinColor }} strokeWidth={1.5} />
          <div className="absolute top-8 left-8 bg-background/80 backdrop-blur-md text-white-soft text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap font-display font-bold uppercase tracking-widest border border-white-soft/10">
            Click to place • Esc to cancel
          </div>
        </motion.div>
      )}

      {/* Floating Sticky Note Cursor */}
      {isStickyMode && (
        <motion.div
          className="fixed pointer-events-none z-[100] drop-shadow-2xl"
          style={{ left: 0, top: 0, transform: stickyTransform }}
        >
          <StickyNoteIcon className="w-8 h-8" style={{ color: stickyColor, fill: stickyColor }} strokeWidth={1.5} />
          <div className="absolute top-8 left-8 bg-background/80 backdrop-blur-md text-white-soft text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap font-display font-bold uppercase tracking-widest border border-white-soft/10">
            Click to place • Esc to cancel
          </div>
        </motion.div>
      )}

      {/* Floating Highlighter Cursor */}
      {isHighlightMode && (
        <motion.div
          className="fixed pointer-events-none z-[100]"
          style={{ left: 0, top: 0, transform: highlightTransform }}
        >
          {/* 3D Pen Body */}
          <div 
            className="absolute w-6 h-32"
            style={{ 
              left: '-12px', 
              bottom: '0px', 
              transformOrigin: 'bottom center', 
              transform: 'rotate(-15deg)' 
            }}
          >
            {/* Pen Tip */}
            <div 
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-6"
              style={{ backgroundColor: highlightColor, clipPath: 'polygon(50% 100%, 0 0, 100% 0)' }}
            />
            {/* Pen Grip */}
            <div className="absolute bottom-6 left-0 w-full h-8 bg-background rounded-sm shadow-lg border border-white-soft/10" />
            {/* Pen Body */}
            <div className="absolute bottom-14 left-0 w-full h-16 bg-gray-mid rounded-t-full shadow-xl border border-white-soft/10" />
            {/* Pen Cap/Top */}
            <div className="absolute bottom-30 left-1/2 -translate-x-1/2 w-4 h-2 bg-white-soft/80 rounded-full" />
            
            {/* Glow effect */}
            <div 
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full blur-xl opacity-50"
              style={{ backgroundColor: highlightColor }}
            />
          </div>
          <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-md text-white-soft text-[10px] px-3 py-1.5 rounded-full whitespace-nowrap font-display font-bold uppercase tracking-widest border border-white-soft/10">
            Select text to highlight • Esc to cancel
          </div>
        </motion.div>
      )}

      {/* Bookmark Tray */}
      <AnimatePresence>
        {isTrayOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="absolute top-20 right-8 z-50 flex flex-col items-center gap-4"
          >
            <div
              className={cn(
                "relative w-64 h-64 rounded-full backdrop-blur-2xl border shadow-2xl overflow-hidden",
                theme === 'dark' ? 'bg-background/60 border-white-soft/10 shadow-black/40' : 'bg-white-soft/60 border-background/10 shadow-background/20'
              )}
              onWheel={(e) => setTrayRotation(r => r + (e.deltaY > 0 ? 60 : -60))}
            >
              {/* Center Label */}
              <div className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full z-20 shadow-inner flex items-center justify-center text-center p-2 border",
                theme === 'dark' ? 'bg-background border-white-soft/10' : 'bg-white-soft border-background/10'
              )}>
                <span className="text-[9px] font-bold text-accent uppercase tracking-widest leading-tight font-display">Stationery<br/>Set</span>
              </div>

              {/* Rotating Container */}
              <motion.div
                className="w-full h-full rounded-full relative"
                animate={{ rotate: trayRotation }}
                transition={{ type: "spring", stiffness: 50, damping: 20 }}
              >
                {PIN_COLORS.map((color, i) => {
                  const angle = i * 60;
                  return (
                    <div
                      key={color}
                      className="absolute top-1/2 left-1/2 w-32 h-32 origin-top-left"
                      style={{
                        transform: `rotate(${angle}deg)`,
                      }}
                    >
                      {/* Divider */}
                      <div className={cn(
                        "absolute top-0 left-0 w-full h-px",
                        theme === 'dark' ? 'bg-white-soft/5' : 'bg-background/5'
                      )} />
                      {/* Pins */}
                      <div
                        className="absolute top-8 left-8 w-16 h-16 cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
                        style={{ transform: `rotate(-${angle + trayRotation}deg)` }}
                        onClick={() => setSelectedPinColor(color)}
                      >
                        <Paperclip className="absolute w-6 h-6 drop-shadow-md -translate-x-2 -translate-y-2 rotate-12" style={{ color }} strokeWidth={1.5} />
                        <Paperclip className="absolute w-6 h-6 drop-shadow-md translate-x-2 -translate-y-1 -rotate-45" style={{ color }} strokeWidth={1.5} />
                        <Paperclip className="absolute w-6 h-6 drop-shadow-md translate-y-2 rotate-90" style={{ color }} strokeWidth={1.5} />
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </div>

            {/* Controls */}
            <div className={cn(
              "flex items-center gap-4 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border",
              theme === 'dark' ? 'bg-background/80 border-white-soft/10' : 'bg-white-soft/80 border-background/10'
            )}>
              <button onClick={() => setTrayRotation(r => r - 60)} className="p-2 hover:bg-white-soft/5 rounded-full transition-colors"><RotateCcw className="w-4 h-4" strokeWidth={1.5} /></button>
              <span className="text-[10px] font-bold text-gray-light select-none font-display uppercase tracking-widest">Scroll to rotate</span>
              <button onClick={() => setTrayRotation(r => r + 60)} className="p-2 hover:bg-white-soft/5 rounded-full transition-colors"><RotateCw className="w-4 h-4" strokeWidth={1.5} /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main 
        className="flex-1 flex overflow-hidden relative w-full h-full"
        style={{ filter: `brightness(${brightness}%)`, transition: 'filter 0.3s ease' }}
      >
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-hidden relative">
          <BookFlip 
            totalPages={book.totalPages}
            currentPage={currentPage}
            onPageChange={handlePageChange}
            renderPage={renderPage}
            aspectRatio={pdfAspectRatio}
            isPlacingPin={!!selectedPinColor}
          />
          
          {/* Progress Bar - Immersive */}
          <AnimatePresence>
            {showToolbar && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className={cn(
                  "absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md flex items-center gap-4 px-6 py-3 rounded-full backdrop-blur-xl border shadow-2xl",
                  theme === 'dark' ? 'bg-background/40 border-white-soft/10' : 'bg-white-soft/40 border-background/10'
                )}
              >
                <span className="text-[10px] font-mono text-gray-light w-8 text-right">{Math.max(1, currentPage)}</span>
                <div 
                  className={cn(
                    "flex-1 h-2 rounded-full overflow-hidden cursor-pointer relative group",
                    theme === 'dark' ? 'bg-white-soft/10' : 'bg-background/10'
                  )}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const percentage = x / rect.width;
                    const targetPage = Math.max(1, Math.min(book.totalPages, Math.ceil(percentage * book.totalPages)));
                    handlePageChange(targetPage);
                  }}
                >
                  <div 
                    className="absolute top-0 left-0 h-full bg-accent transition-all duration-300 ease-out"
                    style={{ width: `${(Math.max(1, currentPage) / book.totalPages) * 100}%` }}
                  />
                  <div className="absolute top-0 left-0 w-full h-full bg-white-soft/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <span className="text-[10px] font-mono text-gray-light w-8">{book.totalPages}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* AI Sidebar */}
        <AnimatePresence>
          {aiPanelOpen && (
            <motion.div 
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className={cn(
                "w-[min(80vw,320px)] border-l flex flex-col z-40 backdrop-blur-2xl shadow-2xl absolute right-0 top-0 bottom-0 pt-16",
                theme === 'dark' ? 'border-white-soft/5 bg-background/95' : 'border-background/5 bg-white-soft/95'
              )}
            >
              <div className={cn(
                "p-5 border-b flex items-center gap-4",
                theme === 'dark' ? 'border-white-soft/5' : 'border-background/5'
              )}>
                <button 
                  onClick={() => setSidebarTab('ai')}
                  className={cn(
                    "pb-2 text-[10px] font-bold transition-all relative font-display uppercase tracking-widest",
                    sidebarTab === 'ai' ? "text-accent" : "text-gray-light hover:text-white-soft"
                  )}
                >
                  Flipverse AI
                  {sidebarTab === 'ai' && <motion.div layoutId="sidebarTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                </button>
                <button 
                  onClick={() => setSidebarTab('highlights')}
                  className={cn(
                    "pb-2 text-[10px] font-bold transition-all relative font-display uppercase tracking-widest",
                    sidebarTab === 'highlights' ? "text-accent" : "text-gray-light hover:text-white-soft"
                  )}
                >
                  Highlights
                  {sidebarTab === 'highlights' && <motion.div layoutId="sidebarTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                </button>
                <button 
                  onClick={() => setSidebarTab('bookmarks')}
                  className={cn(
                    "pb-2 text-[10px] font-bold transition-all relative font-display uppercase tracking-widest",
                    sidebarTab === 'bookmarks' ? "text-accent" : "text-gray-light hover:text-white-soft"
                  )}
                >
                  Bookmarks
                  {sidebarTab === 'bookmarks' && <motion.div layoutId="sidebarTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {sidebarTab === 'ai' ? (
                  <div className="p-5">
                    {aiResponse ? (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "p-4 rounded-2xl text-sm leading-relaxed font-sans",
                          theme === 'dark' ? 'bg-white-soft/5 text-white-soft' : 'bg-background/5 text-background'
                        )}
                      >
                        {aiResponse}
                      </motion.div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-gray-light px-4 gap-6 mt-20 font-display uppercase tracking-widest font-bold">
                        <p className="opacity-60">Ask me to summarize the page, explain a concept, or translate text.</p>
                        <button
                          onClick={() => {
                            const query = "Please explain the contents of this page in simple terms.";
                            setAiQuery(query);
                            handleAskAi(query);
                          }}
                          className="px-6 py-3 bg-accent text-background hover:bg-accent/90 rounded-full transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-accent/20 font-bold"
                        >
                          <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                          Explain Current Page
                        </button>
                      </div>
                    )}
                  </div>
                ) : sidebarTab === 'highlights' ? (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white-soft/5">
                      <span className="text-[10px] font-bold font-display uppercase tracking-widest text-gray-light">
                        {book.highlights?.length || 0} Highlights
                      </span>
                      {book.highlights && book.highlights.length > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to clear all highlights?')) {
                              const updatedBook = { ...book, highlights: [] };
                              setBook(updatedBook);
                              saveBook(updatedBook);
                            }
                          }}
                          className="text-[10px] font-bold font-display uppercase tracking-widest text-accent hover:text-accent/80 transition-colors"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="p-5 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
                    {book.highlights && book.highlights.length > 0 ? (
                      book.highlights.sort((a, b) => a.page - b.page).map(highlight => (
                        <div
                          key={highlight.id}
                          className={cn(
                            "flex flex-col gap-2 p-3 rounded-xl transition-all text-left group relative border",
                            theme === 'dark' ? "bg-white-soft/5 hover:bg-white-soft/10 border-white-soft/5" : "bg-background/5 hover:bg-background/10 border-background/5"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <button 
                              onClick={() => handlePageChange(highlight.page)}
                              className="flex items-center gap-2"
                            >
                              <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: highlight.color }} />
                              <span className="text-[10px] font-bold font-display uppercase tracking-widest text-gray-light">Page {highlight.page + 1}</span>
                            </button>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  const query = `Explain the context of this highlighted section on page ${highlight.page + 1}.`;
                                  setAiQuery(query);
                                  setAiPanelOpen(true);
                                  setSidebarTab('ai');
                                  handleAskAi(query);
                                }}
                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-accent/10 hover:text-accent rounded-md transition-all"
                                title="Explain with AI"
                              >
                                <Sparkles className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updatedBook = { ...book, highlights: book.highlights!.filter(h => h.id !== highlight.id) };
                                  setBook(updatedBook);
                                  saveBook(updatedBook);
                                }}
                                className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-accent/10 hover:text-accent rounded-md transition-all"
                                title="Remove Highlight"
                              >
                                <X className="w-3 h-3" strokeWidth={1.5} />
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-white-soft/60 italic font-sans line-clamp-2">
                            {highlight.text || "Highlighted section"}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-gray-light px-4 gap-4 mt-20 font-display uppercase tracking-widest font-bold">
                        <Highlighter className="w-8 h-8 opacity-20" strokeWidth={1.5} />
                        <p className="opacity-60">No highlights yet. Use the highlighter tool to mark important sections.</p>
                      </div>
                    )}
                  </div>
                </div>
                ) : (
                  <div className="p-5 flex flex-col gap-3">
                    {book.pins && book.pins.length > 0 ? (
                      book.pins.sort((a, b) => a.page - b.page).map(pin => (
                        <button
                          key={pin.id}
                          onClick={() => handlePageChange(pin.page)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl transition-all text-left group border",
                            theme === 'dark' ? "bg-white-soft/5 hover:bg-white-soft/10 border-white-soft/5" : "bg-background/5 hover:bg-background/10 border-background/5"
                          )}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm" style={{ backgroundColor: `${pin.color}20` }}>
                            <Paperclip className="w-4 h-4" style={{ color: pin.color }} strokeWidth={1.5} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] font-bold font-display uppercase tracking-widest text-gray-light">Page {pin.page + 1}</div>
                            <div className="text-[10px] text-white-soft/40 truncate font-sans">Bookmark Pin</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const updatedBook = { ...book, pins: book.pins!.filter(p => p.id !== pin.id) };
                              setBook(updatedBook);
                              saveBook(updatedBook);
                            }}
                            className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-accent/10 hover:text-accent rounded-md transition-all"
                          >
                            <X className="w-3 h-3" strokeWidth={1.5} />
                          </button>
                        </button>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-xs text-gray-light px-4 gap-4 mt-20 font-display uppercase tracking-widest font-bold">
                        <Paperclip className="w-8 h-8 opacity-20" strokeWidth={1.5} />
                        <p className="opacity-60">No bookmarks yet. Use the paperclip tool to pin important pages.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {sidebarTab === 'ai' && (
                <div className={cn(
                  "p-5 border-t",
                  theme === 'dark' ? 'border-white-soft/5' : 'border-background/5'
                )}>
                  <div className="relative">
                    <textarea
                      value={aiQuery}
                      onChange={e => setAiQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleAskAi();
                        }
                      }}
                      placeholder="Ask something..."
                      className={cn(
                        "w-full rounded-2xl pl-4 pr-12 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all font-sans",
                        theme === 'dark' ? 'bg-white-soft/5 text-white-soft placeholder-gray-light/40' : 'bg-background/5 text-background placeholder-gray-mid/40'
                      )}
                      rows={2}
                    />
                    <button 
                      onClick={() => handleAskAi()}
                      disabled={isAiLoading || !aiQuery.trim()}
                      className={cn(
                        "absolute right-2 bottom-2 p-2 rounded-xl transition-all active:scale-95 z-10",
                        (isAiLoading || !aiQuery.trim()) 
                          ? "bg-white-soft/5 text-white-soft/20 cursor-not-allowed" 
                          : "bg-accent text-background hover:bg-accent/90 shadow-lg shadow-accent/20"
                      )}
                    >
                      {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Selection Toolbar */}
      <AnimatePresence>
        {selectionMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-[100] -translate-x-1/2 -translate-y-full mb-4 flex items-center gap-1 p-1 bg-background/90 backdrop-blur-md border border-white-soft/10 rounded-full shadow-2xl"
            style={{ left: selectionMenu.x, top: selectionMenu.y }}
          >
            <button
              onClick={handleHighlightSelection}
              className="flex items-center gap-2 px-4 py-2 hover:bg-white-soft/10 rounded-full text-[10px] font-bold text-white-soft transition-colors font-display uppercase tracking-widest"
            >
              <Highlighter className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
              Highlight
            </button>
            <div className="w-px h-4 bg-white-soft/10 mx-1" />
            <button
              onClick={() => {
                const query = `Explain this text from the book: "${selectionMenu.text}"`;
                setAiQuery(query);
                setAiPanelOpen(true);
                setSidebarTab('ai');
                handleAskAi(query);
                setSelectionMenu(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="flex items-center gap-2 px-4 py-2 hover:bg-white-soft/10 rounded-full text-[10px] font-bold text-white-soft transition-colors font-display uppercase tracking-widest"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" strokeWidth={1.5} />
              Ask AI
            </button>
            <button
              onClick={() => {
                setSelectionMenu(null);
                window.getSelection()?.removeAllRanges();
              }}
              className="p-2 hover:bg-white-soft/10 rounded-full text-gray-light transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Reader;
