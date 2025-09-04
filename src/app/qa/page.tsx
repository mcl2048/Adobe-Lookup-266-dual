
'use client';

import type React from 'react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, ListX, Download, Users, BadgeHelp, FileText, LogOut, LayoutDashboard, Filter } from 'lucide-react';
import DualLanguageText from '@/components/dual-language-text';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccentColorToggle } from '@/components/accent-color-toggle';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import AuthGuard, { type LoggedInUser } from '@/components/auth-guard';
import { cn } from '@/lib/utils';


interface QuickAuditAccountInfo {
  email: string;
  rat: string;
  approver: string;
  pov: string;
  reason: 'Not Registered' | 'Not Paid';
}

export default function QAPage() {
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  
  const [allAccounts, setAllAccounts] = useState<QuickAuditAccountInfo[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<QuickAuditAccountInfo[]>([]);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [selectedApprover, setSelectedApprover] = useState<string>('all');
  const [selectedReason, setSelectedReason] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();


  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/search?type=qa`);
      if (response.status === 401) {
          AuthGuard.logout();
          return;
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch quick audit data.');
      }
      const data = await response.json();
      const accounts: QuickAuditAccountInfo[] = data.qaAccounts || [];
      const userRole = data.role;

      setAllAccounts(accounts);
      setFilteredAccounts(accounts);

      if (userRole === 'admin') {
          const uniqueApprovers = [...new Set(accounts.map(acc => acc.approver).filter(Boolean))];
          setApprovers(uniqueApprovers.sort());
          setSelectedApprover('all');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loggedInUser) {
        fetchAccounts();
    }
  }, [loggedInUser, fetchAccounts]);

  const filteredData = useMemo(() => {
    let data = allAccounts;

    if (loggedInUser?.role === 'admin' && selectedApprover !== 'all') {
      data = data.filter(account => account.approver.toLowerCase() === selectedApprover.toLowerCase());
    }
    
    if (selectedReason !== 'all') {
        data = data.filter(account => account.reason === selectedReason);
    }

    return data;
  }, [selectedApprover, selectedReason, allAccounts, loggedInUser]);

  useEffect(() => {
    setFilteredAccounts(filteredData);
  }, [filteredData]);

  const formatPov = (pov: string, lang: 'en' | 'zh' | 'both' = 'both') => {
    const periodMatch = pov.trim().toLowerCase().match(/^(\d+)([my])$/);
    if (!periodMatch) return pov;

    const amount = parseInt(periodMatch[1], 10);
    const unit = periodMatch[2];
    
    let en: string, zh: string;

    if (unit === 'm') {
        en = `${amount} ${amount > 1 ? 'Months' : 'Month'}`;
        zh = `${amount}个月`;
    } else { // unit === 'y'
        en = `${amount} ${amount > 1 ? 'Years' : 'Year'}`;
        zh = `${amount}年`;
    }

    if (lang === 'en') return en;
    if (lang === 'zh') return zh;
    return { en, zh };
  };


  const downloadAsCsv = () => {
    if (filteredAccounts.length === 0) return;

    // Structure matches payment.csv: ['Email', 'PaymentDate', 'Approver', 'pov']
    const headers = ['"Email"', '"PaymentDate"', '"Approver"', '"pov"'];
    const rows = filteredAccounts.map(account =>
      [
        `"${account.email}"`,
        `"${account.rat}"`,
        `"${account.approver}"`,
        `"${account.pov}"`,
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    const approverName = loggedInUser?.role === 'admin' ? selectedApprover : loggedInUser?.role;
    const fileName = approverName === 'all'
        ? `quick_audit_${today}.csv`
        : `quick_audit_${approverName}_${today}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const downloadAsPdf = () => {
    if (filteredAccounts.length === 0) return;

    const doc = new jsPDF();
    doc.setFont('helvetica');

    const tableHead = [['Email', 'RAT', 'Approver', 'POV', 'Reason']];
    const tableBody = filteredAccounts.map(account => [
      account.email,
      account.rat,
      account.approver,
      formatPov(account.pov, 'en'),
      account.reason
    ]);

    doc.setFontSize(18);
    doc.text('Outstanding Orders for Payment', 14, 22);

    doc.setFontSize(10);
    const generationTime = new Date().toLocaleString('en-GB');
    doc.text(`Report generated on: ${generationTime}`, 14, 30);
    
    doc.setFontSize(12);
    let greeting: string;
    const bodyText: string[] = [
        'Please find a list of your outstanding orders requiring payment below.',
        'Your prompt action is appreciated.'
    ];
    
    const approverName = loggedInUser?.role === 'admin' ? selectedApprover : loggedInUser?.role;
    if (approverName === 'all' || approverName?.toLowerCase() === 'admin') {
        greeting = 'To all concerned Approvers,';
    } else {
        greeting = `Dear ${approverName},`;
    }

    doc.text([greeting, ...bodyText], 14, 40, {
        charSpace: 0.2
    });

    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: 60,
      styles: {
          fontSize: 8,
          font: "helvetica",
      },
      headStyles: {
          fillColor: [34, 49, 63],
          textColor: 255,
          fontStyle: 'bold'
      }
    });
    
    const today = new Date().toISOString().slice(0, 10);
    const fileName = approverName === 'all' 
        ? `Outstanding_Orders_${today}.pdf`
        : `Outstanding_Orders_${approverName}_${today}.pdf`;

    doc.save(fileName);
  };
  
  const renderFilter = () => {
    if (isLoading || error || allAccounts.length === 0) return null;
    
    return (
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            {loggedInUser?.role === 'admin' && (
                <div className="flex items-center space-x-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <Label htmlFor="approver-filter" className="text-sm font-medium">
                      <DualLanguageText en="Approver" zh="批准人" />
                    </Label>
                    <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                        <SelectTrigger id="approver-filter" className="w-full sm:w-[180px]">
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
            <div className="flex items-center space-x-2">
                <Filter className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor="reason-filter" className="text-sm font-medium">
                    <DualLanguageText en="Reason" zh="原因" />
                </Label>
                <Select value={selectedReason} onValueChange={setSelectedReason}>
                    <SelectTrigger id="reason-filter" className="w-full sm:w-[180px]">
                        <SelectValue placeholder={<DualLanguageText en="Select..." zh="选择..." />} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">
                            <DualLanguageText en="All Reasons" zh="所有原因" />
                        </SelectItem>
                        <SelectItem value="Not Paid">
                            <DualLanguageText en="Not Paid" zh="未付款" />
                        </SelectItem>
                        <SelectItem value="Not Registered">
                            <DualLanguageText en="Not Registered" zh="未登记" />
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
  };


  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p className="text-lg">
            <DualLanguageText en="Loading audit data..." zh="正在加载审计数据..." />
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="destructive" className="m-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle><DualLanguageText en="Error" zh="错误" /></AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }

    if (allAccounts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-center">
            <ListX className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">
                <DualLanguageText en="No Accounts to Audit" zh="没有需要审计的账号" />
            </h3>
            <p className="text-muted-foreground">
                <DualLanguageText en="All accounts requiring payment seem to be settled." zh="所有需要付款的账户似乎都已结清。" />
            </p>
        </div>
      );
    }
    
    if (filteredAccounts.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
                 <ListX className="h-10 w-10 mb-4" />
                 <p>
                    <DualLanguageText 
                        en={`No accounts to audit found for the selected filters.`} 
                        zh={`未找到符合当前筛选条件的需审计账号。`} />
                 </p>
            </div>
        );
    }


    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><DualLanguageText en="Account (Email)" zh="账号 (邮箱)" /></TableHead>
              <TableHead>RAT</TableHead>
              <TableHead><DualLanguageText en="Approver" zh="批准人" /></TableHead>
              <TableHead>POV</TableHead>
              <TableHead><DualLanguageText en="Reason" zh="原因" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAccounts.map((account, index) => {
              const formattedPov = formatPov(account.pov, 'both') as { en: string, zh: string };
              return (
              <TableRow key={`${account.email}-${index}`} className={cn(index % 2 === 0 ? 'bg-accent/25' : 'bg-transparent')}>
                <TableCell className="font-medium">{account.email}</TableCell>
                <TableCell>{account.rat}</TableCell>
                <TableCell>{account.approver}</TableCell>
                <TableCell>
                  <DualLanguageText en={formattedPov.en} zh={formattedPov.zh} />
                </TableCell>
                <TableCell>
                    <span className="flex items-center">
                        <BadgeHelp className="h-4 w-4 mr-2 text-muted-foreground" />
                        <DualLanguageText 
                            en={account.reason}
                            zh={account.reason === 'Not Registered' ? '未登记' : '未付款'}
                         />
                    </span>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
       <header className="p-4 border-b flex items-center justify-between bg-card shadow-sm sticky top-0 z-40">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold">
                <DualLanguageText en="Quick Audit (QA)" zh="快速审计 (QA)" />
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button asChild variant="outline">
              <Link href={loggedInUser?.role === 'admin' ? '/adm' : '/proxy'}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <DualLanguageText en="Dashboard" zh="控制台" />
              </Link>
            </Button>
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
            <div className="max-w-4xl mx-auto">
                <Card className="shadow-md rounded-lg">
                <CardHeader>
                    <CardTitle className="text-base font-medium text-muted-foreground">
                        <DualLanguageText en={`A list of accounts that require payment or attention.`} zh={`需要付款或需要注意的账号列表。`} />
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                    {renderFilter()}
                    <div className="border rounded-lg">
                    {renderContent()}
                    </div>
                </CardContent>
                {!isLoading && !error && filteredAccounts.length > 0 && (
                    <CardFooter className="pt-4 justify-end space-x-2">
                        <Button variant="outline" onClick={downloadAsPdf}>
                            <FileText className="mr-2 h-4 w-4" />
                            <DualLanguageText en="Download PDF" zh="下载PDF文件" />
                        </Button>
                        <Button onClick={downloadAsCsv}>
                            <Download className="mr-2 h-4 w-4" />
                            <DualLanguageText en="Download CSV" zh="下载CSV文件" />
                        </Button>
                    </CardFooter>
                )}
                </Card>
            </div>
        )}
      </main>

       <footer className="p-3 text-center text-xs text-muted-foreground border-t mt-auto bg-card space-y-1">
            <p>
                This database is not synchronized with Adobe's database in real-time. Updates occur every Saturday at 9:00 AM.
            </p>
            <p>
                {`Copyright © ${currentYear} Europe Ivy Union. All Rights Reserved.`}
            </p>
       </footer>
    </div>
  );
}

