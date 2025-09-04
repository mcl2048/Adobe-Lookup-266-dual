
'use client';

import type React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertTriangle, NewspaperIcon } from 'lucide-react';
import DualLanguageText from '@/components/dual-language-text';
import { cn } from '@/lib/utils';
import NewsSidebar from '@/components/news-sidebar';
import matter from 'gray-matter';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccentColorToggle } from '@/components/accent-color-toggle';

export interface CsvRow {
  [key: string]: string;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  date?: string;
  tag?: 'High' | 'Medium' | 'Low' | null;
}

export interface SearchResult {
  email: string;
  status: 'Valid' | 'Invalid';
  organization: string;
  subscriptionDetails: string;
  deviceLimit: number;
  approver: string;
  approvalDate: string;
  expirationDate: string;
}

interface FuzzySearchResult {
    message?: string;
    error?: string;
}

interface MenuItem {
  name: string;
  url: string;
}

const UI_RESOURCES = {
  TIPS_TXT: '/tips.txt',
  NEWS_MANIFEST: '/news-manifest.json',
  LOGO: '/logo.png',
  MENU_CONF: '/menu.conf',
};

export default function Home() {
  const [emailInput, setEmailInput] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [fuzzyMessage, setFuzzyMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalEntriesCount, setTotalEntriesCount] = useState<number | null>(null);
  const [tipsContent, setTipsContent] = useState<string | null>(null);
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showLogo, setShowLogo] = useState(false);

  const isMounted = useRef(false);
  const sidebarAutoCollapseTimer = useRef<NodeJS.Timeout | null>(null);

  const loadInitialUIData = useCallback(async () => {
    setIsLoading(true);
    const timestamp = `t=${new Date().getTime()}`;

    const fetchWithTimeout = (resource: RequestInfo | URL, options?: RequestInit, timeout = 15000) => {
      return Promise.race([
        fetch(resource, options),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), timeout)),
      ]);
    };

    const logoPromise = fetchWithTimeout(`${UI_RESOURCES.LOGO}?${timestamp}`, { method: 'HEAD' })
      .then(res => res.ok && isMounted.current && setShowLogo(true))
      .catch(() => { /* Logo is optional, fail silently */ });

    const tipsPromise = fetchWithTimeout(`${UI_RESOURCES.TIPS_TXT}?${timestamp}`)
      .then(res => res.ok ? res.text() : null)
      .then(text => text && isMounted.current && setTipsContent(text.trim()))
      .catch(() => { /* Tips are optional */ });

    const menuPromise = fetchWithTimeout(`${UI_RESOURCES.MENU_CONF}?${timestamp}`)
      .then(res => res.ok ? res.text() : null)
      .then(text => {
        if (text && isMounted.current) {
          const parsedMenuItems = text.split('\n').map(line => line.trim()).filter(line => line && line.includes(','))
            .map(line => {
              const [name, ...urlParts] = line.split(',');
              return { name: name.trim(), url: urlParts.join(',').trim() };
            }).filter(item => item.name && item.url);
          setMenuItems(parsedMenuItems);
        }
      })
      .catch(() => { /* Menu is optional */ });
    
    const countPromise = fetch('/api/count')
      .then(res => res.ok ? res.json() : null)
      .then(data => data && isMounted.current && setTotalEntriesCount(data.count))
      .catch(() => { /* Count is optional, but good to know if it fails */ });

    const newsPromise = fetchWithTimeout(`${UI_RESOURCES.NEWS_MANIFEST}?${timestamp}`)
      .then(res => res.ok ? res.json() : null)
      .then(async (manifestData) => {
        if (Array.isArray(manifestData) && isMounted.current) {
          const newsFilePromises = manifestData.map(async (item: any) => {
            if (item && typeof item.fileName === 'string') {
              try {
                const newsFileResponse = await fetchWithTimeout(`/news/${item.fileName}?${timestamp}`);
                if (newsFileResponse.ok) {
                  const rawContent = await newsFileResponse.text();
                  const { data: frontmatter, content: mdContent } = matter(rawContent);
                  return {
                    id: item.fileName,
                    title: frontmatter.title || item.fileName.replace('.md', ''),
                    content: mdContent.trim(),
                    date: frontmatter.date || undefined,
                    tag: frontmatter.tag || null,
                  };
                }
              } catch { /* Fail silently for individual news files */ }
            }
            return null;
          });
          const loadedNewsItems = (await Promise.all(newsFilePromises)).filter((item): item is NewsItem => item !== null);
          if(isMounted.current) setNewsItems(loadedNewsItems);
        }
      })
      .catch(() => { /* News manifest is optional */ });

    try {
      await Promise.all([logoPromise, tipsPromise, menuPromise, countPromise, newsPromise]);
    } catch (err) {
      if(isMounted.current) {
        setError(err instanceof Error ? err.message : 'Failed to load page assets.');
      }
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    loadInitialUIData();

    return () => {
      isMounted.current = false;
      if (sidebarAutoCollapseTimer.current) {
        clearTimeout(sidebarAutoCollapseTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (newsItems.length > 0 && !isSidebarOpen) {
      setIsSidebarOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsItems]);

  useEffect(() => {
    if (newsItems.length > 0 && isSidebarOpen) {
      if (sidebarAutoCollapseTimer.current) clearTimeout(sidebarAutoCollapseTimer.current);
      sidebarAutoCollapseTimer.current = setTimeout(() => {
        if (isMounted.current) setIsSidebarOpen(false);
      }, 7000);
    }
    return () => {
      if (sidebarAutoCollapseTimer.current) clearTimeout(sidebarAutoCollapseTimer.current);
    };
  }, [newsItems, isSidebarOpen]);

  const performSearch = useCallback(async (searchEmail: string, searchType: 'exact' | 'fuzzy') => {
    setIsSearching(true);
    setError(null);
    setResults(null);
    setFuzzyMessage(null);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: searchEmail, type: searchType }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `An error occurred on the server.`);
      }

      const result: SearchResult | FuzzySearchResult = await response.json();

      if ('error' in result && result.error) {
        setError(result.error);
        setResults(null);
      } else if ('message' in result && result.message) {
        setFuzzyMessage(result.message);
        setResults(null);
      } else {
        setResults(result as SearchResult);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(`${errorMessage} / 搜索过程中发生意外错误。`);
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleExactSearch = useCallback(() => {
    const trimmedEmail = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address format for exact search. / 请输入有效的邮箱地址格式以进行精确搜索。');
      setResults(null);
      setFuzzyMessage(null);
      return;
    }
    performSearch(trimmedEmail, 'exact');
  }, [emailInput, performSearch]);

  const handleFuzzySearch = useCallback(() => {
    const searchTerm = emailInput.trim();
    if (searchTerm.length < 3) {
      setError('Please enter at least 3 characters for fuzzy search. / 请至少输入3个字符进行模糊搜索。');
      setResults(null);
      setFuzzyMessage(null);
      return;
    }
    performSearch(searchTerm, 'fuzzy');
  }, [emailInput, performSearch]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      setEmailInput(e.target.value);
      setError(null);
      setResults(null);
      setFuzzyMessage(null);
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading && !isSearching) {
      const trimmedInput = emailInput.trim();
      if (!trimmedInput) {
        setError('Please enter an email address or prefix. / 请输入邮箱地址或前缀。');
        return;
      }
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedInput)) {
        handleExactSearch();
      } else if (trimmedInput.length >= 3) {
        handleFuzzySearch();
      } else {
        setError('Enter a full email for exact search, or at least 3 characters for fuzzy search. / 输入完整邮箱进行精确搜索，或至少输入3个字符进行模糊搜索。');
      }
    }
  }, [emailInput, isLoading, isSearching, handleExactSearch, handleFuzzySearch]);

  const openLink = useCallback((url: string) => {
    if (url.startsWith('/')) {
        window.location.href = url;
    } else {
        window.open(url, '_blank');
    }
  }, []);
  
  const toggleSidebar = useCallback(() => {
    if (sidebarAutoCollapseTimer.current) {
      clearTimeout(sidebarAutoCollapseTimer.current);
      sidebarAutoCollapseTimer.current = null;
    }
    setIsSidebarOpen(prev => !prev);
  }, []);

  const currentYear = new Date().getFullYear();
  const trimmedEmailForButtons = emailInput.trim();
  const looksLikeFullEmailForButton = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmailForButtons);
  const canFuzzySearchForButton = trimmedEmailForButtons.length >= 3;
  const canSearch = !isLoading && !isSearching;

  const totalUsersMessageEn = `Adobe Creative Cloud subscription status is normal. Current user count: ${totalEntriesCount ?? '...'}.`;
  const totalUsersMessageZh = `Adobe Creative Cloud 订阅状态正常。当前用户总数：${totalEntriesCount ?? '...'}。`;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
       <NewsSidebar newsItems={newsItems} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
       <header className="p-4 border-b flex items-center justify-between bg-card sticky top-0 z-40">
          <div className="flex items-center space-x-4">
            {newsItems && newsItems.length > 0 && (
                <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle News Sidebar">
                    <NewspaperIcon className="h-5 w-5" />
                </Button>
            )}
             {showLogo && (
                <Image
                    src={UI_RESOURCES.LOGO}
                    alt="Logo"
                    width={180}
                    height={60}
                    priority
                    className="object-contain h-10 w-auto"
                 />
             )}
            <h1 className="text-lg font-semibold hidden sm:block">
                Adobe Subscription Lookup
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            {menuItems.map((item, index) => (
                <Button
                    key={index}
                    variant="ghost"
                    onClick={() => openLink(item.url)}
                    className="text-xs font-medium"
                >
                    {item.name}
                </Button>
            ))}
            <AccentColorToggle />
            <ThemeToggle />
          </div>
      </header>

      <div className="sticky top-[calc(4rem+1px)] z-30">
        {tipsContent && (
           <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
             <AlertTriangle className="w-4 h-4" />
             <AlertDescription>
               {tipsContent}
             </AlertDescription>
           </Alert>
         )}
         {!isLoading && totalEntriesCount !== null && (
            <div
              className="relative w-full border p-4 flex items-center bg-primary/10 border-primary/30 text-primary"
            >
              <CheckCircle className="h-4 w-4 mr-3 text-primary" />
              <div className="text-sm [&_p]:leading-relaxed">
                  <DualLanguageText
                    en={totalUsersMessageEn}
                    zh={totalUsersMessageZh}
                    tag="span"
                    className="inline"
                  />
              </div>
            </div>
         )}
      </div>

      <main className="flex-grow container mx-auto px-4 py-6 md:py-8 lg:py-10">
        <div className="max-w-4xl mx-auto">
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>
                    <DualLanguageText en="Enter Email Address or Prefix" zh="输入邮箱地址或前缀" />
                </CardTitle>
                 {isLoading && (
                    <div className="flex items-center text-sm text-muted-foreground pt-2">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      <DualLanguageText en="Loading initial data..." zh="正在加载初始数据..." tag="span" />
                    </div>
                 )}
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0 mb-4">
                  <Input
                    type="text"
                    placeholder="e.g., user@example.com or user@"
                    value={emailInput}
                    onChange={handleInputChange}
                    onKeyPress={handleKeyPress}
                    className="flex-grow"
                    aria-label="Email Address or Prefix Input"
                    disabled={isLoading || isSearching}
                    autoComplete="off"
                  />
                  <Button
                    onClick={handleExactSearch}
                    disabled={!canSearch || !looksLikeFullEmailForButton}
                    aria-label="Perform exact email search"
                    className="w-full sm:w-auto"
                  >
                    {isSearching && looksLikeFullEmailForButton ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        <DualLanguageText en="Searching..." zh="搜索中..." tag="span" />
                      </>
                    ) : (
                      <DualLanguageText en="Exact Search" zh="精确搜索" tag="span" />
                    )}
                  </Button>
                   <Button
                     onClick={handleFuzzySearch}
                     disabled={!canSearch || !canFuzzySearchForButton}
                     variant="secondary"
                     aria-label="Perform fuzzy email search"
                     className="w-full sm:w-auto"
                   >
                     {isSearching && canFuzzySearchForButton && !looksLikeFullEmailForButton ? (
                       <>
                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                         <DualLanguageText en="Searching..." zh="搜索中..." tag="span" />
                       </>
                     ) : (
                        <DualLanguageText en="Fuzzy Search" zh="模糊搜索" tag="span" />
                     )}
                   </Button>
                </div>
                 <div className="text-xs text-muted-foreground mt-2">
                    <DualLanguageText
                        en="Press Enter for exact search (full email) or fuzzy search (prefix/part, min 3 chars)."
                        zh="输入完整邮箱后按 Enter 进行精确搜索，或输入前缀/部分（至少3字符）后按 Enter 进行模糊搜索。"
                        tag="div"
                    />
                 </div>
              </CardContent>
            </Card>

            {fuzzyMessage && !isSearching && (
                <Alert className="mb-8">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle><DualLanguageText en="Fuzzy Search" zh="模糊搜索提示" /></AlertTitle>
                    <AlertDescription>
                        {fuzzyMessage.split(' / ').map((line, index, arr) => (
                            <p key={`fuzzy-line-${index}`} className={index === 1 && arr.length > 1 ? 'text-sm text-muted-foreground/80' : ''}>{line}</p>
                        ))}
                    </AlertDescription>
                </Alert>
            )}

            {error && !isLoading && (
              <Alert variant="destructive" className="mb-8">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle><DualLanguageText en="Error" zh="错误" /></AlertTitle>
                <AlertDescription>
                    {error.split(' / ').map((line, index, arr) => (
                        <p key={`error-line-${index}`} className={index === 1 && arr.length > 1 ? 'text-sm text-destructive-foreground/80' : ''}>{line}</p>
                    ))}
                </AlertDescription>
              </Alert>
            )}

            {isSearching && !isLoading && (
              <div className="flex justify-center items-center mb-8 text-primary">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                <DualLanguageText en="Searching..." zh="搜索中..." tag="span" />
              </div>
            )}

            {results && !isSearching && (
              <Card className="overflow-hidden">
                <CardHeader>
                    <CardTitle><DualLanguageText en="Search Results" zh="查询结果" /></CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead><DualLanguageText en="Adobe Account (Email)" zh="Adobe 账号 (邮箱)" /></TableHead>
                          <TableHead><DualLanguageText en="Status" zh="状态" /></TableHead>
                          <TableHead><DualLanguageText en="Organization" zh="所属组织" /></TableHead>
                          <TableHead><DualLanguageText en="Subscription Details" zh="订阅详情" /></TableHead>
                          <TableHead><DualLanguageText en="Device Limit" zh="设备限制" /></TableHead>
                          <TableHead><DualLanguageText en="Approver" zh="批准人" /></TableHead>
                          <TableHead><DualLanguageText en="Approval Date (RAT)" zh="批准日期 (RAT)" /></TableHead>
                          <TableHead><DualLanguageText en="Expiration Date" zh="有效期限" /></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="whitespace-normal break-words font-medium">{results.email}</TableCell>
                          <TableCell>
                              <span className={cn(
                                  "px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap",
                                  results.status === 'Valid' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                              )}>
                                <DualLanguageText en={results.status} zh={results.status === 'Valid' ? '有效' : '无效'} tag="span" />
                              </span>
                          </TableCell>
                          <TableCell className="whitespace-normal break-words">{results.organization}</TableCell>
                          <TableCell className="whitespace-normal break-words">{results.subscriptionDetails}</TableCell>
                          <TableCell className="whitespace-nowrap">
                               <DualLanguageText
                                 en={`${results.deviceLimit} ${results.deviceLimit === 1 ? 'Device' : 'Devices'}`}
                                 zh={`${results.deviceLimit} 台设备`}
                                 tag="span"
                               />
                          </TableCell>
                          <TableCell className="whitespace-normal break-words">{results.approver}</TableCell>
                          <TableCell className="whitespace-normal break-words">{results.approvalDate}</TableCell>
                          <TableCell className="whitespace-normal break-words">
                            {results.expirationDate === 'Rolling' ?
                                <DualLanguageText en="Rolling" zh="滚动" /> :
                                results.expirationDate
                            }
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
        </div>
      </main>

       <footer className="p-3 text-center text-xs text-muted-foreground border-t mt-auto bg-card space-y-1">
            <p>
                This database is not synchronized with Adobe's database in real-time. Updates occur every Saturday at 9:00 AM. If you cannot find your valid information, please check again after the update or contact the school's IT Desk Service: itpro@eu-ivy.org
            </p>
            <p>
                {`Copyright © ${currentYear} Europe Ivy Union. All Rights Reserved.`}
            </p>
       </footer>
    </div>
  );
}

    