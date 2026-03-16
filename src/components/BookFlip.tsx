import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import HTMLFlipBook from 'react-pageflip';

interface BookFlipProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  renderPage: (pageIndex: number) => React.ReactNode;
  aspectRatio?: number;
  isPlacingPin?: boolean;
}

export const BookFlip = ({ totalPages, currentPage, onPageChange, renderPage, aspectRatio = 1 / 1.4, isPlacingPin = false }: BookFlipProps) => {
  const flipBookRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external page changes to flipbook
  useEffect(() => {
    if (flipBookRef.current && flipBookRef.current.pageFlip()) {
      const flipBook = flipBookRef.current.pageFlip();
      const currentFlipPage = flipBook.getCurrentPageIndex();
      if (currentFlipPage !== currentPage && Math.abs(currentFlipPage - currentPage) > 1) {
        flipBook.turnToPage(currentPage);
      }
    }
  }, [currentPage]);

  const onFlip = useCallback((e: any) => {
    onPageChange(e.data);
  }, [onPageChange]);

  const handleNext = () => {
    if (flipBookRef.current && flipBookRef.current.pageFlip()) {
      flipBookRef.current.pageFlip().flipNext();
    }
  };

  const handlePrev = () => {
    if (flipBookRef.current && flipBookRef.current.pageFlip()) {
      flipBookRef.current.pageFlip().flipPrev();
    }
  };

  // Create an array of pages
  const pages = Array.from({ length: totalPages }, (_, i) => i);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-8" ref={containerRef}>
      <HTMLFlipBook
        width={400}
        height={Math.round(400 / aspectRatio)}
        size="stretch"
        minWidth={200}
        maxWidth={1000}
        minHeight={280}
        maxHeight={1400}
        maxShadowOpacity={0.5}
        showCover={true}
        mobileScrollSupport={true}
        onFlip={onFlip}
        className="book-flip-container shadow-2xl shadow-zinc-950/50"
        style={{}}
        ref={flipBookRef}
        startPage={currentPage}
        drawShadow={true}
        flippingTime={1000}
        usePortrait={true}
        startZIndex={0}
        autoSize={true}
        clickEventForward={true}
        useMouseEvents={false}
        swipeDistance={30}
        showPageCorners={false}
        disableFlipByClick={true}
      >
        {pages.map((pageIndex) => (
          <div key={pageIndex} className="bg-zinc-50 overflow-hidden border-r border-zinc-200/50">
            {/* Only render content if the page is close to the current page to save memory */}
            {Math.abs(currentPage - pageIndex) <= 4 ? (
              renderPage(pageIndex)
            ) : (
              <div className="w-full h-full bg-zinc-50" />
            )}
          </div>
        ))}
      </HTMLFlipBook>

      {/* Navigation Areas - Double Click to Turn */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 cursor-pointer z-30 group flex items-center justify-start pl-2 sm:pl-4"
        onDoubleClick={handlePrev}
      >
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-zinc-950/50 text-zinc-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
          <ChevronLeft className="w-6 h-6 sm:w-8 sm:h-8" />
        </div>
      </div>
      <div 
        className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 cursor-pointer z-30 group flex items-center justify-end pr-2 sm:pr-4"
        onDoubleClick={handleNext}
      >
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-zinc-950/50 text-zinc-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
          <ChevronRight className="w-6 h-6 sm:w-8 sm:h-8" />
        </div>
      </div>
    </div>
  );
};
