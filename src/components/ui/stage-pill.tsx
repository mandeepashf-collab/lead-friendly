import * as React from 'react';
import { cn } from '@/lib/utils';

type StageTone = 'hot' | 'warm' | 'cold' | 'new' | 'won' | 'lost';

interface StagePillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StageTone;
  children: React.ReactNode;
}

const TONE_CLASS: Record<StageTone, string> = {
  hot:  'stage-pill--hot',
  warm: 'stage-pill--warm',
  cold: 'stage-pill--cold',
  new:  'stage-pill--new',
  won:  'stage-pill--won',
  lost: 'stage-pill--lost',
};

export function StagePill({ tone, className, children, ...rest }: StagePillProps) {
  return (
    <span className={cn('stage-pill', TONE_CLASS[tone], className)} {...rest}>
      {children}
    </span>
  );
}

export type { StageTone };
