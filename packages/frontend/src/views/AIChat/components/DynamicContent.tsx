import React, { useEffect, useRef, useState } from 'react';

export interface DynamicContentProps {
  content: string | number | null | undefined | React.ReactNode;
  className?: string;
  truncate?: boolean;
  page?: string;
  convert?: boolean;
  readmore?: number;
}

const DynamicContent: React.FC<DynamicContentProps> = ({
  content,
  className = '',
  truncate = false,
  page = 'default',
  convert = false,
  readmore,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const isEditorContent = (content: string | number): boolean => {
    return (typeof content === 'string' && content.startsWith('$editorvalue')) || convert;
  };

  const removeEditorPrefix = (str: string): string => {
    return page === 'default'
      ? str.replace(/^\$editorvalue/, '')
      : str.replace(/^\$editorvalue/, '');
  };

  // Handle mfenced replacement after content is rendered
  useEffect(() => {
    if (containerRef.current) {
      const fencedElements = containerRef.current.querySelectorAll('mfenced');
      fencedElements.forEach((fenced) => {
        const mrow = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mrow');
        const open = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mo');
        open.textContent = fenced.getAttribute('open') || '[';
        const close = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'mo');
        close.textContent = fenced.getAttribute('close') || ']';

        mrow.appendChild(open);
        Array.from(fenced.childNodes).forEach((child) => {
          mrow.appendChild(child.cloneNode(true));
        });
        mrow.appendChild(close);

        fenced.replaceWith(mrow);
      });
    }
  }, [content]);

  // Check for content overflow
  useEffect(() => {
    if (readmore && contentRef.current) {
      const element = contentRef.current;
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      const maxHeight = lineHeight * readmore;
      const actualHeight = element.scrollHeight;
      
      setHasOverflow(actualHeight > maxHeight);
    }
  }, [content, readmore]);

  if (content === null || content === undefined) {
    return null;
  }

  const baseClasses = `w-full ${className}`;
  const contentString = content.toString();

  // Get line clamp styles
  const getLineClampStyle = () => {
    if (truncate) {
      return {
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden',
      };
    }
    if (readmore && !isExpanded) {
      return {
        display: '-webkit-box',
        WebkitLineClamp: readmore,
        WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden',
      };
    }
    return {};
  };

  if (isEditorContent(contentString)) {
    const cleanContent = removeEditorPrefix(contentString);
    return (
      <div
        className={baseClasses}
        ref={containerRef}
      >
        <div
          ref={contentRef}
          id="edtiorContent"
          dangerouslySetInnerHTML={{ __html: cleanContent }}
          className="prose  max-w-none justify-between"
          style={getLineClampStyle()}
        />
        {readmore && hasOverflow && !isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="text-blue-600 hover:text-blue-800 mt-2 text-sm font-medium"
          >
            Read More
          </button>
        )}
        {readmore && hasOverflow && isExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            className="text-blue-600 hover:text-blue-800 mt-2 text-sm font-medium"
          >
            Read Less
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={baseClasses}>
      <span ref={contentRef} style={getLineClampStyle()}>{content}</span>
      {readmore && hasOverflow && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-blue-600 hover:text-blue-800 mt-2 text-sm font-medium block"
        >
          Read More
        </button>
      )}
      {readmore && hasOverflow && isExpanded && (
        <button
          onClick={() => setIsExpanded(false)}
          className="text-blue-600 hover:text-blue-800 mt-2 text-sm font-medium block"
        >
          Read Less
        </button>
      )}
    </div>
  );
};

export default DynamicContent;
