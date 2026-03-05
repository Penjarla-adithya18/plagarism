'use client'

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

export default function ContactPage() {
  const { t } = useI18n();
  
  return (
    <main className="app-surface py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-3xl font-bold text-foreground">{t('contact.title')}</h1>
        <p className="mb-8 text-muted-foreground">{t('contact.subtitle')}</p>

        <div className="space-y-3 rounded-2xl border bg-card p-6 text-muted-foreground">
          <p><span className="font-semibold text-foreground">{t('contact.email')}</span> support@hyperlocaljobs.example</p>
          <p><span className="font-semibold text-foreground">{t('contact.supportHours')}</span> {t('contact.hoursText')}</p>
          <p><span className="font-semibold text-foreground">{t('contact.responseTime')}</span> {t('contact.responseText')}</p>
        </div>

        <div className="mt-8">
          <Button asChild variant="outline">
            <Link href="/">{t('auth.backHome')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
