import React from 'react';

interface PageHeaderProps {
  label: string;
  title: string;
  description?: string;
  children?: React.ReactNode;
  italicTitle?: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({ 
  label, 
  title, 
  description, 
  children,
  italicTitle = true
}) => {
  return (
    <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-4">
      <div className="max-w-2xl">
        <span className="font-label text-[10px] md:text-xs uppercase tracking-[0.3em] text-brand-primary mb-2 md:mb-4 block font-bold">
          {label}
        </span>
        <h2 className={`font-headline text-4xl md:text-5xl font-extrabold tracking-tighter text-on-background ${italicTitle ? 'italic' : ''}`}>
          {title}
        </h2>
        {description && (
          <p className="text-on-surface-variant text-lg leading-relaxed mt-4">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-4 w-full md:w-auto">
          {children}
        </div>
      )}
    </header>
  );
};

export default PageHeader;
