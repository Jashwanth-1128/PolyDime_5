import React, { useState, useEffect, useRef } from 'react';
import { Book, subscribeToBooks, saveBook, deleteBook, getBook } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { loadPdf, renderPdfPage, extractPdfText } from '../lib/pdf';
import { BookOpen, Plus, Trash2, Search, Clock, Library as LibraryIcon, CheckCircle, Image as ImageIcon, Loader2, Sparkles, X, Upload } from 'lucide-react';
import { auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const BookCover = ({ book }: { book: Book }) => {
  if (book.coverUrl) {
    return (
      <div className="w-full h-full relative">
        <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
      </div>
    );
  }
  return (
    <div className="w-full h-full bg-background flex flex-col items-center justify-center p-6 text-center gap-4 border-l-4 border-accent/40 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent" />
      </div>
      <BookOpen className="w-12 h-12 text-gray-light mb-2 relative z-10" strokeWidth={1.5} />
      <h4 className="text-white-soft font-display text-lg font-bold leading-tight line-clamp-4 uppercase tracking-tight relative z-10">
        {book.title}
      </h4>
      <div className="absolute bottom-6 left-6 right-6 h-px bg-gray-light/10" />
      <div className="absolute top-6 left-6 right-6 h-px bg-gray-light/10" />
    </div>
  );
};

export const Library = ({ onOpenBook, onRequireAuth, headerActions }: { onOpenBook: (id: string) => void, onRequireAuth?: () => void, headerActions?: React.ReactNode }) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'reading' | 'read'>('reading');
  const [generatingCovers, setGeneratingCovers] = useState<Set<string>>(new Set());
  const [coverModalBook, setCoverModalBook] = useState<Book | null>(null);
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [pendingCoverBooks, setPendingCoverBooks] = useState<Book[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeToBooks((allBooks) => {
      setBooks(allBooks);
    });
    return () => unsubscribe();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    if (!auth.currentUser && onRequireAuth) {
      onRequireAuth();
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const newUploadedBooks: Book[] = [];

    for (const file of files) {
      const fileData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const arrayBuffer = await file.arrayBuffer();
      let coverUrl = '';
      let totalPages = 0;

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const pdf = await loadPdf(arrayBuffer);
          totalPages = pdf.numPages;
          
          if (totalPages > 0) {
          // Use a smaller scale for the cover to keep the data URL small
          coverUrl = await renderPdfPage(pdf, 1, 'temp', 0.3);
          if (coverUrl.length > 200000) {
            console.warn('Cover image too large, skipping cover');
            coverUrl = '';
          }
          } else {
            throw new Error('PDF has no pages');
          }
        } catch (err) {
          console.error('Failed to parse PDF', err);
          alert(`Failed to parse PDF: ${file.name}`);
          continue;
        }
      } else {
        alert(`Only PDF files are supported currently. Skipped: ${file.name}`);
        continue;
      }

      const newBook: Book = {
        id: uuidv4(),
        title: file.name.replace(/\.pdf$/i, '').substring(0, 190) || 'Untitled', // Truncate to fit Firestore rules
        fileData: fileData,
        lastOpened: Date.now(),
        currentPage: 0,
        totalPages,
        status: 'reading'
      };
      
      if (coverUrl) {
        newBook.coverUrl = coverUrl;
      }

      try {
        await saveBook(newBook);
        newUploadedBooks.push(newBook);
      } catch (err) {
        console.error('Failed to save book', err);
        alert(`Failed to save book: ${file.name}. The file might be too large or there was a network error.`);
      }
    }
    
    if (newUploadedBooks.length > 0) {
      setPendingCoverBooks(newUploadedBooks);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this book?')) {
      await deleteBook(id);
    }
  };

  const handleToggleStatus = async (e: React.MouseEvent, book: Book) => {
    e.stopPropagation();
    const newStatus: 'reading' | 'read' = book.status === 'read' ? 'reading' : 'read';
    const updatedBook: Book = { ...book, status: newStatus };
    await saveBook(updatedBook);
  };

  const ensureApiKey = async () => {
    if (typeof window !== 'undefined' && (window as any).aistudio) {
      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await (window as any).aistudio.openSelectKey();
      }
    }
  };

  const handleGenerateCoverAction = async (book: Book, size: string) => {
    if (generatingCovers.has(book.id)) return;
    setGeneratingCovers(prev => new Set(prev).add(book.id));
    setCoverModalBook(null);
    try {
      await ensureApiKey();
      const dynamicAi = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY || '' });

      const fullBook = await getBook(book.id);
      if (!fullBook || !fullBook.fileData) throw new Error('Could not load book data');

      const pdf = await loadPdf(fullBook.fileData);
      const text = await extractPdfText(pdf, 1);
      const text2 = fullBook.totalPages > 1 ? await extractPdfText(pdf, 2) : '';
      
      const combinedText = `${text}\n${text2}`.substring(0, 1000); // Take first 1000 chars

      const prompt = `Generate a beautiful, minimalist book cover for a book with the following content/title. Make it look like a modern, professional book cover without any text on it. Content: ${combinedText}`;

      const response = await dynamicAi.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: prompt,
        config: {
          imageConfig: {
            imageSize: size as any,
            aspectRatio: "3:4"
          }
        }
      });

      let base64Image = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          base64Image = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (base64Image) {
        const updatedBook = { ...book, coverUrl: base64Image };
        await saveBook(updatedBook);
      } else {
        alert('Failed to generate cover image.');
      }
    } catch (error: any) {
      console.error('Error generating cover:', error);
      if (error?.message?.includes('Requested entity was not found') || error?.message?.includes('PERMISSION_DENIED') || error?.message?.includes('permission')) {
        alert('API Key error: Please ensure you have selected a valid Google Cloud API key with billing enabled.');
        if (typeof window !== 'undefined' && (window as any).aistudio) {
          (window as any).aistudio.openSelectKey();
        }
      } else {
        alert('Error generating cover. Please try again.');
      }
    } finally {
      setGeneratingCovers(prev => {
        const next = new Set(prev);
        next.delete(book.id);
        return next;
      });
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>, book: Book) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Image = event.target?.result as string;
      if (base64Image) {
        const updatedBook = { ...book, coverUrl: base64Image };
        await saveBook(updatedBook);
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredBooks = books.filter(b => {
    const matchesSearch = b.title.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === 'read' ? b.status === 'read' : (b.status !== 'read');
    return matchesSearch && matchesTab;
  });
  
  const recentBooks = books.filter(b => b.status !== 'read').slice(0, 3);

  const renderBookCard = (book: Book, index: number, prefix: string = '') => (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      key={`${prefix}${book.id}`}
      onClick={() => onOpenBook(book.id)}
      className="group cursor-pointer flex flex-col relative [perspective:1200px]"
    >
      <div className="relative w-full aspect-[2/3] mb-4">
        <motion.div
          className="relative w-full h-full origin-left"
          style={{ transformStyle: 'preserve-3d' }}
          initial={{ rotateY: 25, rotateX: -5, translateZ: 0 }}
          whileHover={{ rotateY: 0, rotateX: 0, translateZ: 60, translateY: -12, scale: 1.05 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          {/* Front Cover */}
          <div 
            className="absolute inset-0 bg-background rounded-r-sm overflow-hidden border border-gray-light/20"
            style={{ transform: 'translateZ(0px)', backfaceVisibility: 'hidden' }}
          >
            <BookCover book={book} />
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-end pb-6 gap-2">
              <div className="flex items-center justify-center gap-2 transform translate-y-8 group-hover:translate-y-0 transition-all duration-300">
                <button
                  onClick={(e) => handleToggleStatus(e, book)}
                  className="p-2 bg-accent/90 hover:bg-accent rounded-full text-background shadow-lg backdrop-blur-sm transition-colors"
                  title={book.status === 'read' ? 'Mark as Reading' : 'Mark as Read'}
                >
                  <CheckCircle className="w-4 h-4" strokeWidth={2} />
                </button>
                <label
                  className="p-2 bg-gray-mid/90 hover:bg-accent rounded-full text-white-soft shadow-lg backdrop-blur-sm cursor-pointer transition-colors"
                  title="Upload Custom Cover"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Upload className="w-4 h-4" strokeWidth={2} />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleUploadCover(e, book)}
                  />
                </label>
                <button
                  onClick={(e) => { e.stopPropagation(); setCoverModalBook(book); }}
                  disabled={generatingCovers.has(book.id)}
                  className="p-2 bg-accent/90 hover:bg-accent rounded-full text-background shadow-lg backdrop-blur-sm disabled:opacity-50 transition-colors"
                  title="Generate AI Cover"
                >
                  {generatingCovers.has(book.id) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" strokeWidth={2} />}
                </button>
                <button
                  onClick={(e) => handleDelete(e, book.id)}
                  className="p-2 bg-background/90 hover:bg-red-500 rounded-full text-white-soft shadow-lg backdrop-blur-sm transition-colors"
                  title="Delete Book"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            </div>
            {/* Progress indicator on cover */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/80 backdrop-blur-sm">
              <div 
                className="h-full bg-accent" 
                style={{ width: `${(Math.max(1, book.currentPage) / book.totalPages) * 100}%` }}
              />
            </div>
          </div>
          
          {/* Back Cover */}
          <div className="absolute inset-0 bg-background rounded-l-sm border border-gray-light/20" style={{ transform: 'translateZ(-30px) rotateY(180deg)' }} />

          {/* Spine (Left) */}
          <div className="absolute top-0 bottom-0 left-0 w-[30px] bg-gray-mid flex items-center justify-center overflow-hidden origin-left" style={{ transform: 'rotateY(-90deg)' }}>
            <span className="text-[10px] text-gray-light font-mono whitespace-nowrap -rotate-90">{book.title}</span>
          </div>

          {/* Pages (Right) */}
          <div className="absolute top-[2px] bottom-[2px] right-0 w-[30px] bg-white-soft origin-right border-l border-gray-light/20" style={{ transform: 'rotateY(90deg)' }}>
            <div className="w-full h-full flex flex-col justify-evenly opacity-10">
              {Array.from({length: 10}).map((_, i) => <div key={i} className="w-full h-[1px] bg-background" />)}
            </div>
          </div>
          
          {/* Pages (Top) */}
          <div className="absolute top-0 left-[2px] right-[2px] h-[30px] bg-white-soft origin-top border-b border-gray-light/20" style={{ transform: 'rotateX(90deg)' }} />
          
          {/* Pages (Bottom) */}
          <div className="absolute bottom-0 left-[2px] right-[2px] h-[30px] bg-white-soft origin-bottom border-t border-gray-light/20" style={{ transform: 'rotateX(-90deg)' }} />
        </motion.div>

        {/* Shelf */}
        <div className="absolute -bottom-4 left-[-20%] right-[-20%] h-4 bg-gradient-to-b from-gray-mid/20 to-gray-mid/40 shadow-[0_15px_30px_rgba(0,0,0,0.3)] border-t border-gray-light/10 z-[-1]" />
      </div>
      
      <div className="flex flex-col items-center w-full mt-4 pt-4 border-t border-gray-light/10 relative">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10 rounded-xl" />
        <h3 className="font-bold text-white-soft text-sm px-1 w-full text-center group-hover:text-accent transition-colors line-clamp-2 min-h-[2.5rem] flex items-center justify-center leading-tight font-display uppercase tracking-tight">
          {book.title}
        </h3>
        <div className="w-full px-3 mt-3">
          <div className="flex items-center justify-between text-[10px] text-gray-light mb-1.5 font-sans uppercase tracking-widest font-bold">
            <span className="bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20 text-accent">
              {Math.round((Math.max(1, book.currentPage) / (book.totalPages || 1)) * 100)}%
            </span>
            <span className="opacity-80">
              {Math.max(1, book.currentPage)} / {book.totalPages} pages
            </span>
          </div>
          <div className="h-1 w-full bg-gray-mid/30 rounded-full overflow-hidden border border-gray-light/5">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(Math.max(1, book.currentPage) / (book.totalPages || 1)) * 100}%` }}
              className="h-full bg-accent"
            />
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-background text-white-soft p-8 selection:bg-accent/20"
    >
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-display tracking-tighter flex items-center gap-4 uppercase"
          >
            <div className="p-3 bg-accent/5 rounded-2xl border border-accent/10">
              <BookOpen className="w-10 h-10 text-accent" strokeWidth={1.5} />
            </div>
            Flipverse
          </motion.h1>
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto"
          >
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-light" strokeWidth={1.5} />
              <input
                type="text"
                placeholder="Search library..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full sm:w-72 bg-gray-mid/30 border border-gray-light/20 rounded-xl py-2.5 pl-11 pr-4 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-gray-light/40 font-sans"
              />
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-accent text-background px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/10 active:scale-95 whitespace-nowrap shrink-0 font-display uppercase tracking-wider cta-pulse"
            >
              <Plus className="w-4 h-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Add Book</span>
            </button>
            {headerActions && (
              <>
                <div className="w-px h-6 bg-gray-light/20 hidden sm:block mx-1" />
                <div className="shrink-0">
                  {headerActions}
                </div>
              </>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              accept=".pdf,.PDF,application/pdf"
              multiple
              className="hidden"
            />
          </motion.div>
        </header>

        {books.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-32 border border-gray-light/10 rounded-[2rem] bg-gray-mid/10 backdrop-blur-sm shadow-sm"
          >
            <div className="w-20 h-20 mx-auto bg-gray-mid/20 rounded-full flex items-center justify-center mb-6 border border-gray-light/20 shadow-sm">
              <BookOpen className="w-8 h-8 text-accent" strokeWidth={1.5} />
            </div>
            <h2 className="text-4xl font-display text-white-soft mb-2 uppercase tracking-tight">Your library is empty</h2>
            <p className="text-gray-light mb-8 max-w-sm mx-auto font-sans text-lg">Upload a PDF book to start reading. Your progress will be saved automatically.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-accent text-background px-8 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-accent/10 font-display uppercase tracking-wider"
            >
              Upload PDF
            </button>
          </motion.div>
        ) : (
          <div className="space-y-16">
            <div className="flex items-center gap-8 border-b border-gray-light/10 pb-4">
              <button
                onClick={() => setActiveTab('reading')}
                className={`text-2xl font-display transition-colors relative uppercase tracking-tight ${activeTab === 'reading' ? 'text-accent' : 'text-gray-light hover:text-white-soft'}`}
              >
                Reading
                {activeTab === 'reading' && <motion.div layoutId="tab" className="absolute -bottom-4 left-0 right-0 h-0.5 bg-accent" />}
              </button>
              <button
                onClick={() => setActiveTab('read')}
                className={`text-2xl font-display transition-colors relative uppercase tracking-tight ${activeTab === 'read' ? 'text-accent' : 'text-gray-light hover:text-white-soft'}`}
              >
                Read
                {activeTab === 'read' && <motion.div layoutId="tab" className="absolute -bottom-4 left-0 right-0 h-0.5 bg-accent" />}
              </button>
            </div>

            {!search && recentBooks.length > 0 && activeTab === 'reading' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h2 className="text-xl font-display text-accent mb-8 flex items-center gap-3 uppercase tracking-[0.2em] font-bold">
                  <Clock className="w-6 h-6" strokeWidth={1.5} />
                  Recently Opened
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-10 gap-y-12">
                  <AnimatePresence mode="popLayout">
                    {recentBooks.map((book, index) => renderBookCard(book, index, 'recent-'))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-xl font-display text-accent mb-8 flex items-center gap-3 uppercase tracking-[0.2em] font-bold">
                <LibraryIcon className="w-6 h-6" strokeWidth={1.5} />
                {search ? 'Search Results' : 'All Books'}
              </h2>
              <motion.div 
                layout
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-10 gap-y-12"
              >
                <AnimatePresence mode="popLayout">
                  {filteredBooks.map((book, index) => renderBookCard(book, index, 'all-'))}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Cover Generation Modal */}
      <AnimatePresence>
        {coverModalBook && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setCoverModalBook(null)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-mid border border-gray-light/20 rounded-2xl p-8 max-w-sm w-full shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-3xl font-display text-white-soft flex items-center gap-3 uppercase tracking-tight">
                  <ImageIcon className="w-6 h-6 text-accent" strokeWidth={1.5} />
                  Generate Cover
                </h3>
                <button onClick={() => setCoverModalBook(null)} className="text-gray-light hover:text-accent transition-colors">
                  <X className="w-6 h-6" strokeWidth={1.5} />
                </button>
              </div>
              <p className="text-gray-light text-sm mb-8 font-sans leading-relaxed">
                Select the resolution for the AI-generated cover. Higher resolutions may take longer.
              </p>
              <div className="space-y-4 mb-8">
                {['1K', '2K', '4K'].map((size) => (
                  <label key={size} className="flex items-center gap-3 p-4 rounded-xl border border-gray-light/10 cursor-pointer hover:bg-white-soft/5 transition-colors group">
                    <input type="radio" name="imageSize" value={size} checked={imageSize === size} onChange={(e) => setImageSize(e.target.value as any)} className="text-accent focus:ring-accent bg-background border-gray-light/20" />
                    <span className="text-white-soft font-sans font-medium group-hover:text-accent transition-colors">{size} Resolution</span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => handleGenerateCoverAction(coverModalBook, imageSize)}
                className="w-full py-4 bg-accent text-background rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent/10 font-display uppercase tracking-wider cta-pulse"
              >
                <ImageIcon className="w-5 h-5" strokeWidth={2} />
                Generate Now
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auto-Generate Covers Modal */}
      <AnimatePresence>
        {pendingCoverBooks.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-mid border border-gray-light/20 rounded-2xl p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className="text-3xl font-display text-white-soft mb-4 flex items-center gap-3 uppercase tracking-tight">
                <Sparkles className="w-6 h-6 text-accent" strokeWidth={1.5} />
                Generate AI Covers?
              </h3>
              <p className="text-gray-light text-sm mb-8 font-sans leading-relaxed">
                You just added {pendingCoverBooks.length} book(s). Would you like to automatically generate beautiful AI covers for them?
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setPendingCoverBooks([])}
                  className="px-6 py-3 rounded-xl text-gray-light hover:text-white-soft hover:bg-white-soft/5 transition-colors font-bold font-display uppercase tracking-wider"
                >
                  No thanks
                </button>
                <button
                  onClick={() => {
                    const booksToProcess = [...pendingCoverBooks];
                    setPendingCoverBooks([]);
                    booksToProcess.forEach(b => handleGenerateCoverAction(b, '1K'));
                  }}
                  className="px-6 py-3 bg-accent text-background rounded-xl transition-all font-bold flex items-center gap-2 shadow-lg shadow-accent/10 font-display uppercase tracking-wider cta-pulse"
                >
                  <ImageIcon className="w-5 h-5" strokeWidth={2} />
                  Yes, generate
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};
