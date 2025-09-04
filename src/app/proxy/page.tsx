
'use client';

import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, ListX, Download, Users, FileText, BadgeHelp, LogOut, Search } from 'lucide-react';
import DualLanguageText from '@/components/dual-language-text';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccentColorToggle } from '@/components/accent-color-toggle';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AuthGuard, { type LoggedInUser } from '@/components/auth-guard';

interface ProxyData {
  email: string;
  status: 'Valid' | 'Invalid';
  organization: string;
  subscriptionDetails: string;
  deviceLimit: number;
  approver: string;
  approvalDate: string;
  expirationDate: string;
  tag: string;
}

const ROWS_PER_PAGE_KEY = 'proxy_rows_per_page';

const getSortPriority = (account: ProxyData) => {
    if (account.tag === 'Not Paid') return 0;
    if (account.tag === 'Not Registered') return 1;
    if (account.status === 'Invalid') return 2;
    if (account.tag === 'Authorization Expired') return 3;
    return 4; // Valid and no other tags
};


export default function ProxyPage() {
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [allData, setAllData] = useState<ProxyData[]>([]);
  const [paginatedData, setPaginatedData] = useState<ProxyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [selectedApprover, setSelectedApprover] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showQaNotification, setShowQaNotification] = useState(false);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    try {
      const storedRowsPerPage = localStorage.getItem(ROWS_PER_PAGE_KEY);
      if (storedRowsPerPage && !isNaN(parseInt(storedRowsPerPage))) {
        setRowsPerPage(parseInt(storedRowsPerPage));
      }
    } catch (e) {
      console.warn("Could not read rows per page from localStorage.");
    }
  }, []);

  const handleRowsPerPageChange = (value: string) => {
    const numValue = parseInt(value);
    setRowsPerPage(numValue);
    setCurrentPage(1); // Reset to first page
    try {
        localStorage.setItem(ROWS_PER_PAGE_KEY, value);
    } catch (e) {
        console.warn("Could not save rows per page to localStorage.");
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setShowQaNotification(false);
    try {
      const response = await fetch(`/api/search?type=proxy`);
       if (response.status === 401) {
          AuthGuard.logout();
          return;
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch proxy data.');
      }
      const data = await response.json();
      
      const accounts: ProxyData[] = data.proxyData || [];
      const userRole = data.role;
      
      accounts.sort((a, b) => {
        const priorityA = getSortPriority(a);
        const priorityB = getSortPriority(b);
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        return a.email.localeCompare(b.email);
      });

      setAllData(accounts);
      
      const hasQaIssues = accounts.some(acc => acc.tag === 'Not Paid' || acc.tag === 'Not Registered');
      setShowQaNotification(hasQaIssues);


      if (userRole === 'admin') {
          const uniqueApprovers = [...new Set(accounts.map(acc => acc.approver).filter(Boolean))];
          setApprovers(uniqueApprovers.sort());
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loggedInUser) {
      fetchData();
    }
  }, [loggedInUser, fetchData]);

  const filteredData = useMemo(() => {
    let data = allData;

    // Filter by selected approver (for admin)
    if (loggedInUser?.role === 'admin' && selectedApprover !== 'all') {
      data = data.filter(item => item.approver.toLowerCase() === selectedApprover.toLowerCase());
    }

    // Filter by search term
    if (searchTerm) {
        data = data.filter(item => item.email.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return data;
  }, [allData, selectedApprover, loggedInUser, searchTerm]);


  const totalPages = Math.ceil(filteredData.length / rowsPerPage);

  useEffect(() => {
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    setPaginatedData(filteredData.slice(start, end));
  }, [filteredData, currentPage, rowsPerPage]);
  
  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedApprover, searchTerm]);


  const downloadAsCsv = (dataToDownload: ProxyData[]) => {
    if (dataToDownload.length === 0) return;

    const headers = ['"Email"', '"Status"', '"Organization"', '"Subscription Details"', '"Device Limit"', '"Approver"', '"Approval Date"', '"Expiration Date"', '"Tag"'];
    const rows = dataToDownload.map(account =>
      [
        `"${account.email}"`,
        `"${account.status}"`,
        `"${account.organization}"`,
        `"${account.subscriptionDetails}"`,
        `"${account.deviceLimit}"`,
        `"${account.approver}"`,
        `"${account.approvalDate}"`,
        `"${account.expirationDate}"`,
        `"${account.tag}"`,
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    const approverName = loggedInUser?.role === 'admin' ? selectedApprover : loggedInUser?.role;
    const fileName = `proxy_data_${approverName}_${today}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const downloadAsPdf = (dataToDownload: ProxyData[]) => {
    if (dataToDownload.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFont('helvetica');

    const tableHead = [['Email', 'Status', 'Organization', 'Approver', 'Approval Date', 'Expiration Date', 'Tag']];
    const tableBody = dataToDownload.map(account => [
      account.email,
      account.status,
      account.organization,
      account.approver,
      account.approvalDate,
      account.expirationDate,
      account.tag,
    ]);

    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: 20,
      styles: { fontSize: 7, font: "helvetica" },
      headStyles: { fillColor: [34, 49, 63], textColor: 255, fontStyle: 'bold' }
    });
    
    const today = new Date().toISOString().slice(0, 10);
    const approverName = loggedInUser?.role === 'admin' && selectedApprover !== 'all' ? selectedApprover : (loggedInUser?.role || 'user');
    const fileName = `proxy_data_${approverName}_${today}.pdf`;
    doc.save(fileName);
  };

  const renderFilters = () => {
    if (isLoading || error || allData.length === 0) return null;
    
    return (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="relative w-full md:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search by email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                />
            </div>

            {loggedInUser?.role === 'admin' && (
                <div className="flex items-center space-x-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <Label htmlFor="approver-filter" className="text-sm font-medium">
                      <DualLanguageText en="Filter by Approver" zh="按批准人筛选" />
                    </Label>
                    <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                        <SelectTrigger id="approver-filter" className="w-full sm:w-[200px]">
                            <SelectValue placeholder={<DualLanguageText en="Select..." zh="选择..." />} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">
                                <DualLanguageText en="All Approvers" zh="所有批准人" />
                            </SelectItem>
                            {approvers.map(approver => (
                                <SelectItem key={approver} value={approver}>
                                    {approver}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}
        </div>
    );
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-center space-x-2 py-4">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
            >
                Previous
            </Button>
            <span>
                Page {currentPage} of {totalPages}
            </span>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
            >
                Next
            </Button>
        </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return <div className="flex items-center justify-center p-10 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }
    if (error) {
      return <Alert variant="destructive" className="m-4"><AlertTriangle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>;
    }
    if (allData.length === 0) {
      return <div className="flex flex-col items-center justify-center p-10 text-center"><ListX className="h-12 w-12 text-muted-foreground mb-4" /><h3 className="text-xl font-semibold">No Data Found</h3><p className="text-muted-foreground">There is no proxy data available for your role.</p></div>;
    }
    if (paginatedData.length === 0) {
        return <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground"><ListX className="h-10 w-10 mb-4" /><p>No results found for the current search or filter.</p></div>;
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead>Expiration Date</TableHead>
                <TableHead>Tag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((account, index) => (
              <TableRow key={account.email} className={cn(index % 2 === 0 ? 'bg-accent/25' : 'bg-transparent')}>
                <TableCell className="font-medium">{account.email}</TableCell>
                 <TableCell>
                  <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap", 
                      account.status === 'Valid' ? 'bg-primary/20 text-primary' : (account.status === 'Invalid' ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground')
                  )}>
                    {account.status}
                  </span>
                </TableCell>
                <TableCell>{account.organization}</TableCell>
                <TableCell>{account.approver}</TableCell>
                <TableCell>{account.expirationDate}</TableCell>
                <TableCell>
                    {account.tag && (
                        <span className={cn("flex items-center text-xs font-semibold", {
                            'text-destructive': account.tag === 'Authorization Expired',
                            'text-amber-600 dark:text-amber-500': account.tag === 'Not Paid' || account.tag === 'Not Registered',
                        })}>
                           {account.tag === 'Authorization Expired' ? <AlertTriangle className="h-4 w-4 mr-1.5" /> : <BadgeHelp className="h-4 w-4 mr-1.5" />}
                           {account.tag}
                        </span>
                    )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <header className="p-4 border-b flex items-center justify-between bg-card sticky top-0 z-40">
        <h1 className="text-lg font-semibold">Proxy Management</h1>
        <div className="flex items-center space-x-2">
            <Button asChild variant="outline"><Link href="/">Back to Search</Link></Button>
            <div className="relative">
                <Button asChild variant="outline"><Link href="/qa">Quick Audit</Link></Button>
                {showQaNotification && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                )}
            </div>
            {loggedInUser && (
                <Button variant="ghost" size="icon" onClick={() => AuthGuard.logout()}>
                  <LogOut className="h-4 w-4" />
                </Button>
            )}
            <AccentColorToggle />
            <ThemeToggle />
        </div>
      </header>
      
      <main className="flex-grow container mx-auto px-4 py-6 md:py-8 lg:py-10">
        {!loggedInUser ? <AuthGuard onAuthSuccess={setLoggedInUser} /> : (
            <div className="max-w-7xl mx-auto">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium text-muted-foreground">
                        A list of all users managed by approvers.
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {renderFilters()}
                     {isLoading && allData.length === 0 ? (
                       <div className="flex items-center justify-center p-10 text-muted-foreground"><Loader2 className="h-8 w-8 animate-spin" /></div>
                     ) : (
                       <div className="border rounded-lg">{renderContent()}</div>
                     )}
                    {renderPagination()}
                  </CardContent>
                  <CardFooter className="pt-4 justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="rows-per-page" className="text-sm font-medium text-muted-foreground">Rows per page</Label>
                        <Select value={String(rowsPerPage)} onValueChange={handleRowsPerPageChange}>
                            <SelectTrigger id="rows-per-page" className="w-[80px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="20">20</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                                <SelectItem value="100">100</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {filteredData.length > 0 && (
                        <div className="flex space-x-2">
                           <Button variant="outline" onClick={() => downloadAsPdf(filteredData)}>
                               <FileText className="mr-2 h-4 w-4" />
                               Download PDF
                           </Button>
                           <Button onClick={() => downloadAsCsv(filteredData)}>
                               <Download className="mr-2 h-4 w-4" />
                               Download CSV
                           </Button>
                        </div>
                    )}
                  </CardFooter>
                </Card>
            </div>
        )}
      </main>

       <footer className="p-3 text-center text-xs text-muted-foreground border-t mt-auto bg-card space-y-1">
            <p>{`Copyright © ${currentYear} Europe Ivy Union. All Rights Reserved.`}</p>
       </footer>
    </div>
  );
}
