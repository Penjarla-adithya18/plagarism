'use client'

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/contexts/I18nContext';

export default function GuidelinesPage() {
  const { t } = useI18n();
  
  return (
    <main className="app-surface py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <h1 className="mb-4 text-3xl font-bold text-foreground">{t('guidelines.title')}</h1>
        <p className="mb-8 text-muted-foreground">
          {t('guidelines.subtitle')}
        </p>

        <div className="space-y-4 rounded-2xl border bg-card p-6 text-muted-foreground">
          <p>• {t('guidelines.rule1')}</p>
          <p>• {t('guidelines.rule2')}</p>
          <p>• {t('guidelines.rule3')}</p>
          <p>• {t('guidelines.rule4')}</p>
          <p>• {t('guidelines.rule5')}</p>
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
