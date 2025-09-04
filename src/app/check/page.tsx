
'use client';

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, ListX, Download, Users, LogOut, ShieldAlert } from 'lucide-react';
import DualLanguageText from '@/components/dual-language-text';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccentColorToggle } from '@/components/accent-color-toggle';
import AuthGuard, { type LoggedInUser } from '@/components/auth-guard';
import { cn } from '@/lib/utils';

interface ExpiredAccountInfo {
  email: string;
  organization: string;
  approver: string;
  expirationDate: string;
}

export default function CheckPage() {
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);

  const [allExpiredAccounts, setAllExpiredAccounts] = useState<ExpiredAccountInfo[]>([]);
  const [filteredAccounts, setFilteredAccounts] = useState<ExpiredAccountInfo[]>([]);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [selectedApprover, setSelectedApprover] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  const fetchExpiredAccounts = useCallback(async (user: LoggedInUser) => {
    if (user.role !== 'admin') {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/search?type=expired`);
       if (response.status === 401) {
          AuthGuard.logout();
          return;
      }
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch expired accounts data.');
      }
      const data = await response.json();
      const accounts: ExpiredAccountInfo[] = data.expiredAccounts || [];

      setAllExpiredAccounts(accounts);
      setFilteredAccounts(accounts);

      const uniqueApprovers = [...new Set(accounts.map(acc => acc.approver).filter(Boolean))];
      setApprovers(uniqueApprovers.sort());
      setSelectedApprover('all');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (loggedInUser) {
        fetchExpiredAccounts(loggedInUser);
    }
  }, [loggedInUser, fetchExpiredAccounts]);

  useEffect(() => {
    if (loggedInUser?.role !== 'admin') return;

    if (selectedApprover === 'all') {
      setFilteredAccounts(allExpiredAccounts);
    } else {
      setFilteredAccounts(
        allExpiredAccounts.filter(account => account.approver === selectedApprover)
      );
    }
  }, [selectedApprover, allExpiredAccounts, loggedInUser]);

  const downloadAsCsv = () => {
    if (filteredAccounts.length === 0) return;

    const headers = ['"Account (Email)"', '"File"', '"Approver"', '"Expiration Date"'];
    const rows = filteredAccounts.map(account =>
      [
        `"${account.email}"`,
        `"${account.organization}"`,
        `"${account.approver}"`,
        `"${account.expirationDate}"`
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    const approverName = loggedInUser?.role === 'admin' ? selectedApprover : loggedInUser?.role;
    const fileName = approverName === 'all'
        ? `expired_accounts_${today}.csv`
        : `expired_accounts_${approverName}_${today}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const renderFilter = () => {
    if (isLoading || error || allExpiredAccounts.length === 0 || loggedInUser?.role !== 'admin') return null;
    
    return (
        <div className="flex items-center space-x-4 mb-6">
            <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                <Label htmlFor="approver-filter" className="text-sm font-medium">
                  <DualLanguageText en="Filter by Approver" zh="按批准人筛选" />
                </Label>
            </div>
            <Select value={selectedApprover} onValueChange={setSelectedApprover}>
                <SelectTrigger id="approver-filter" className="w-full sm:w-[250px]">
                    <SelectValue placeholder={<DualLanguageText en="Select an approver..." zh="选择一个批准人..." />} />
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
    );
  };


  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4" />
          <p className="text-lg">
            <DualLanguageText en="Loading expired accounts..." zh="正在加载到期账号..." />
          </p>
        </div>
      );
    }
    
    if (loggedInUser?.role !== 'admin') {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-xl font-semibold mb-2">
                <DualLanguageText en="Access Denied" zh="访问被拒绝" />
            </h3>
            <p className="text-muted-foreground">
                <DualLanguageText en="This page is restricted to administrators only." zh="此页面仅限管理员访问。" />
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

    if (allExpiredAccounts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-10 text-center">
            <ListX className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">
                <DualLanguageText en="No Expired Accounts to Address" zh="没有需要处理的到期账号" />
            </h3>
            <p className="text-muted-foreground">
                <DualLanguageText en="All accounts with a defined expiration are either active or have been removed from the organization." zh="所有具有明确到期日期的帐户，要么当前处于活动状态，要么已从组织中移除。" />
            </p>
        </div>
      );
    }
    
    if (filteredAccounts.length === 0 && selectedApprover !== 'all' && loggedInUser?.role === 'admin') {
        return (
            <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
                 <ListX className="h-10 w-10 mb-4" />
                 <p>
                    <DualLanguageText 
                        en={`No expired accounts found for approver: ${selectedApprover}`} 
                        zh={`未找到批准人为 "${selectedApprover}" 的到期账号。`} />
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
              <TableHead><DualLanguageText en="File" zh="文件" /></TableHead>
              <TableHead><DualLanguageText en="Approver" zh="批准人" /></TableHead>
              <TableHead><DualLanguageText en="Expiration Date" zh="到期日期" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAccounts.map((account, index) => (
              <TableRow key={account.email} className={cn(index % 2 === 0 ? 'bg-accent/25' : 'bg-transparent')}>
                <TableCell className="font-medium">{account.email}</TableCell>
                <TableCell>{account.organization}</TableCell>
                <TableCell>{account.approver}</TableCell>
                <TableCell>{account.expirationDate}</TableCell>
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
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold">
                <DualLanguageText en="Check Expired Accounts" zh="检查到期账号" />
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <Button asChild variant="outline">
              <Link href="/">
                  <DualLanguageText en="Back to Search" zh="返回搜索" />
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
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-medium text-muted-foreground">
                        <DualLanguageText en={`A list of accounts that have expired and require manual removal from their subscription list.`} zh={`已到期且需要从其订阅列表中手动移除的账号列表。`} />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {renderFilter()}
                    <div className="border rounded-lg">
                      {renderContent()}
                    </div>
                  </CardContent>
                  {!isLoading && !error && filteredAccounts.length > 0 && loggedInUser?.role === 'admin' && (
                     <CardFooter className="pt-4 justify-end">
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
