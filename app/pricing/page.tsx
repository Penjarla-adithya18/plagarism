'use client'

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

export default function PricingPage() {
  const { t } = useI18n();
  
  return (
    <main className="app-surface py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-3xl font-bold text-foreground">{t('pricing.title')}</h1>
        <p className="mb-8 text-muted-foreground">
          {t('pricing.subtitle')}
        </p>

        <div className="space-y-4 rounded-2xl border bg-card p-6">
          <h2 className="text-xl font-semibold">{t('pricing.currentPlan')}</h2>
          <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
            <li>{t('pricing.workersFree')}</li>
            <li>{t('pricing.employersFeatures')}</li>
            <li>{t('pricing.escrowPayments')}</li>
          </ul>
        </div>

        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link href="/signup?role=employer">{t('pricing.getStartedEmployer')}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t('auth.backHome')}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
