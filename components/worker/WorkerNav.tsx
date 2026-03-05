'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Briefcase, Home, Search, MessageSquare, User, LogOut, Wallet, Target, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useI18n } from '@/contexts/I18nContext';
import { Badge } from '@/components/ui/badge';
import { NotificationBell } from '@/components/ui/notification-bell';
import { useState } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: any;
  mobileLabel: string;
  badge?: number;
}

export function WorkerNav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { t } = useI18n();
  const [showMenu, setShowMenu] = useState(false);

  const primaryNavItems: NavItem[] = [
    { href: '/worker/dashboard', label: t('nav.dashboard'), icon: Home, mobileLabel: 'Home', badge: undefined },
    { href: '/worker/jobs', label: t('nav.worker.findJobs'), icon: Search, mobileLabel: 'Jobs', badge: undefined },
    { href: '/worker/applications', label: t('nav.worker.myApps'), icon: Briefcase, mobileLabel: 'Apps', badge: undefined },
    { href: '/worker/chat', label: t('nav.messages'), icon: MessageSquare, badge: 0, mobileLabel: 'Chat' },
  ];

  const secondaryNavItems: Omit<NavItem, 'mobileLabel' | 'badge'>[] = [
    { href: '/worker/earnings', label: t('nav.worker.earnings'), icon: Wallet },
    { href: '/worker/skill-gap', label: t('nav.worker.skillGap'), icon: Target },
  ];

  return (
    <>
      {/* Top Bar */}
      <nav className="border-b glass sticky top-0 z-50 shadow-soft">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/worker/dashboard" className="flex items-center gap-2 touch-target">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-sm">
                <Briefcase className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-primary hidden sm:inline text-lg">HyperLocal</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {primaryNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} prefetch={false}>
                    <Button
                      variant={isActive ? 'default' : 'ghost'}
                      size="sm"
                      title={item.label}
                      className={cn(
                        'gap-2 transition-smooth',
                        isActive && 'bg-primary shadow-sm'
                      )}
                      suppressHydrationWarning
                    >
                      <item.icon className="w-4 h-4" />
                      <span suppressHydrationWarning>{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-xs">
                          {item.badge}
                        </Badge>
                      )}
                    </Button>
                  </Link>
                );
              })}
              {secondaryNavItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} prefetch={false}>
                    <Button
                      variant={isActive ? 'default' : 'ghost'}
                      size="sm"
                      title={item.label}
                      className={cn(
                        'gap-2 transition-smooth',
                        isActive && 'bg-primary shadow-sm'
                      )}
                      suppressHydrationWarning
                    >
                      <item.icon className="w-4 h-4" />
                      <span suppressHydrationWarning>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>

            {/* Desktop User Menu */}
            <div className="hidden md:flex items-center gap-2">
              <NotificationBell />
              <Link href="/worker/profile" prefetch={false}>
                <Button
                  variant={pathname === '/worker/profile' ? 'default' : 'ghost'}
                  size="icon"
                  title="Profile"
                  className={cn(pathname === '/worker/profile' && 'bg-primary shadow-sm')}
                >
                  <User className="w-4 h-4" />
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="gap-2 touch-target"
                title={t('nav.logout')}
                suppressHydrationWarning
              >
                <LogOut className="w-4 h-4" />
                <span suppressHydrationWarning>{t('nav.logout')}</span>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <NotificationBell />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowMenu(!showMenu)}
                className="touch-target"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Dropdown Menu */}
      {showMenu && (
        <div className="md:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={() => setShowMenu(false)}>
          <div className="absolute top-14 right-0 w-full max-w-xs glass m-4 p-4 rounded-2xl shadow-soft-lg" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-2">
              {secondaryNavItems.map((item) => (
                <Link key={item.href} href={item.href} prefetch={false} onClick={() => setShowMenu(false)}>
                  <Button variant="ghost" className="w-full justify-start gap-3 touch-target" suppressHydrationWarning>
                    <item.icon className="w-4 h-4" />
                    <span suppressHydrationWarning>{item.label}</span>
                  </Button>
                </Link>
              ))}
              <Link href="/worker/profile" prefetch={false} onClick={() => setShowMenu(false)}>
                <Button variant="ghost" className="w-full justify-start gap-3 touch-target" suppressHydrationWarning>
                  <User className="w-4 h-4" />
                  <span suppressHydrationWarning>{t('nav.profile')}</span>
                </Button>
              </Link>
              <div className="border-t pt-2">
                <Button
                  variant="ghost"
                  onClick={() => { logout(); setShowMenu(false); }}
                  className="w-full justify-start gap-3 touch-target text-destructive"
                  suppressHydrationWarning
                >
                  <LogOut className="w-4 h-4" />
                  <span suppressHydrationWarning>{t('nav.logout')}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t shadow-soft-lg pb-safe">
        <div className="grid grid-cols-4 gap-1 px-2 py-2">
          {primaryNavItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="flex flex-col items-center justify-center touch-target transition-smooth"
              >
                <div
                  className={cn(
                    'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-smooth',
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                  )}
                >
                  <div className="relative">
                    <item.icon className={cn('w-5 h-5', isActive && 'scale-110')} />
                    {item.badge !== undefined && item.badge > 0 && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center">
                        <span className="text-[10px] text-white font-medium">{item.badge}</span>
                      </div>
                    )}
                  </div>
                  <span className={cn('text-[10px] font-medium', isActive && 'text-primary')}>
                    {item.mobileLabel}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export default WorkerNav;
