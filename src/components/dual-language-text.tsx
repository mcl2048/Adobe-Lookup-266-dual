
import type React from 'react';
import { cn } from '@/lib/utils';

interface DualLanguageTextProps {
  en: string;
  zh: string;
  className?: string;
  spanClassName?: string; // Optional class for individual spans
  tag?: keyof JSX.IntrinsicElements; // Allow specifying the container tag
}

const DualLanguageText: React.FC<DualLanguageTextProps> = ({
  en,
  zh,
  className,
  spanClassName,
  tag = 'span', // Default to span for inline context, change if needed for block
}) => {
  // Use the specified tag as the container element
  const Tag = tag;

  // Render simple spans within the container Tag
  // Ensure spans are treated as inline by default unless 'block' is specified
  return (
    <Tag className={className}>
      <span className={cn("text-sm", spanClassName)}>{en}</span>
      <span className={cn("block text-xs text-muted-foreground", spanClassName)}>{zh}</span>
    </Tag>
  );
};

export default DualLanguageText;

    