
'use client';

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound } from 'lucide-react';
import DualLanguageText from '@/components/dual-language-text';
import { useToast } from '@/hooks/use-toast';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [pinInput, setPinInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const handleSuccessfulLogin = useCallback((role: string) => {
    toast({
        title: 'Login Successful',
        description: `Welcome, ${role}.`,
    });
    const redirectUrl = searchParams.get('redirect');
    if (redirectUrl) {
        router.replace(redirectUrl);
        return;
    }
    // Default redirect logic
    if (role === 'admin') {
        router.replace('/adm');
    } else {
        router.replace('/proxy');
    }
  }, [router, searchParams, toast]);


  useEffect(() => {
    // Check if user is already logged in by verifying the cookie with the backend
    async function checkSession() {
      try {
        const res = await fetch('/api/session');
        if (res.ok) {
          const { user } = await res.json();
          if (user?.role) {
             handleSuccessfulLogin(user.role);
             return;
          }
        }
      } catch (e) {
        // Fail silently, user will be prompted to log in
      }
      setIsCheckingSession(false);
    }
    checkSession();
  }, [handleSuccessfulLogin]);

  const handlePinAuth = useCallback(async () => {
    if (!pinInput) {
      setAuthError('Please enter the PIN. / 请输入PIN码。');
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: pinInput }),
      });
      
      const data = await response.json();

      if (!response.ok) {
          throw new Error(data.error || 'Authentication failed.');
      }
      
      if (data.success && data.role) {
         handleSuccessfulLogin(data.role);
      } else {
         setAuthError('Incorrect PIN. / PIN码不正确。');
         setPinInput('');
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Authentication failed. Please try again. / 验证失败，请重试。');
    } finally {
      setIsAuthenticating(false);
    }
  }, [pinInput, handleSuccessfulLogin]);

  if (isCheckingSession) {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
            <Loader2 className="mb-4 h-8 w-8 animate-spin" />
            <p>Verifying session...</p>
        </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-background text-foreground p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            <DualLanguageText en="System Login" zh="系统登录" />
          </CardTitle>
          <AlertDescription>
            <DualLanguageText en="Please enter your PIN to continue." zh="请输入您的PIN码以继续。" />
          </AlertDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pin-input">
              <DualLanguageText en="PIN Code" zh="PIN码" />
            </Label>
            <Input
              id="pin-input"
              type="password"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handlePinAuth()}
              disabled={isAuthenticating}
              autoFocus
            />
          </div>
          {authError && <p className="text-sm text-destructive">{authError}</p>}
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={handlePinAuth} disabled={isAuthenticating}>
            {isAuthenticating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <DualLanguageText en="Login" zh="登录" />
          </Button>
        </CardFooter>
      </Card>
      <footer className="p-3 text-center text-xs text-muted-foreground mt-auto">
         <p>
             {`Copyright © ${new Date().getFullYear()} Europe Ivy Union. All Rights Reserved.`}
         </p>
    </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground"><Loader2 className="mb-4 h-8 w-8 animate-spin" /><p>Loading Login Page...</p></div>}>
      <LoginContent />
    </Suspense>
  );
}
