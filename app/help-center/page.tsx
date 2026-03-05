'use client'

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

export default function HelpCenterPage() {
  const { t } = useI18n();
  
  return (
    <main className="app-surface py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-3xl font-bold text-foreground">{t('help.title')}</h1>
        <p className="mb-8 text-muted-foreground">{t('help.subtitle')}</p>

        <div className="space-y-4 rounded-2xl border bg-card p-6 text-muted-foreground">
          <p><span className="font-semibold text-foreground">{t('help.q1')}</span> {t('help.a1')}</p>
          <p><span className="font-semibold text-foreground">{t('help.q2')}</span> {t('help.a2')}</p>
          <p><span className="font-semibold text-foreground">{t('help.q3')}</span> {t('help.a3')}</p>
        </div>

        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link href="/contact">{t('help.contactSupport')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t('auth.backHome')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
