
'use client';

import type React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from '@/components/ui/scroll-area';
import { XIcon, CalendarDays } from 'lucide-react';
import DualLanguageText from './dual-language-text';
import { cn } from '@/lib/utils';
import type { NewsItem } from '../app/page'; // Import NewsItem from page.tsx

interface NewsSidebarProps {
  newsItems: NewsItem[];
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const NewsSidebar: React.FC<NewsSidebarProps> = ({ newsItems, isOpen, setIsOpen }) => {
  if (!newsItems || newsItems.length === 0) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="left" className="w-full sm:w-[400px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b flex justify-between items-center">
          <SheetTitle>
            <DualLanguageText en="Latest News" zh="最新消息" />
          </SheetTitle>
          <SheetClose asChild>
            <button
              type="button"
              className="p-1 rounded-md hover:bg-accent"
              aria-label="Close news sidebar"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </SheetClose>
        </SheetHeader>
        <ScrollArea className="flex-grow">
          <div className="p-4">
            {newsItems.length > 0 ? (
              <Accordion type="single" collapsible className="w-full">
                {newsItems.map((item) => (
                  <AccordionItem value={item.id} key={item.id}>
                    <AccordionTrigger className="text-left hover:no-underline py-3">
                      <div className="flex flex-col w-full space-y-1">
                        <div className="flex justify-between items-center w-full">
                          <span className="font-medium text-sm">{item.title}</span>
                          {item.tag && (
                            <Badge
                              className={cn(
                                "ml-2 px-1.5 py-0.5 text-xs font-semibold h-5 border-transparent",
                                item.tag === 'High' && 'bg-red-500 text-white hover:bg-red-500/90',
                                item.tag === 'Medium' && 'bg-yellow-400 text-yellow-900 hover:bg-yellow-400/90',
                                item.tag === 'Low' && 'bg-blue-500 text-white hover:bg-blue-500/90'
                              )}
                            >
                              {item.tag}
                            </Badge>
                          )}
                        </div>
                        {item.date && (
                          <div className="text-xs text-muted-foreground flex items-center">
                            <CalendarDays className="h-3 w-3 mr-1.5" />
                            {new Date(item.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="prose prose-sm dark:prose-invert max-w-none pt-1 pb-3">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {item.content}
                      </ReactMarkdown>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            ) : (
              <p className="text-sm text-muted-foreground">
                <DualLanguageText en="No news available at the moment." zh="暂时没有新的消息。" />
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

export default NewsSidebar;
