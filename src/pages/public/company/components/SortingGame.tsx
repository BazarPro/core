import { Check, Hand, RotateCcw, ShoppingBasket, Timer, Trophy, Users } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PrintedLabel } from '../../../../components/products/PrintedLabel';
import { SortMarkBadge } from '../../../../components/sellers/SortMarkBadge';
import { Button } from '../../../../components/ui/button';
import type { LabelFormat } from '../../../../shared/constants';
import { SORT_COLORS, SORT_LETTERS, sortMark } from '../../../../shared/sortCode';
import { cn } from '../../../../lib/utils';

/** The code of a mark from its parts (the inverse of sortMark, without extra letters). */
const codeOf = (pile: number, letter: string, number: number, pair: number) =>
  pile + 10 * (SORT_LETTERS.indexOf(letter) + SORT_LETTERS.length * (number + 100 * pair));

/** The pile the player sorts into baskets; the other piles go to other helpers */
const MY_PILE = 3;

/**
 * Four sellers on the pile of the player, alike on purpose: two share the letter, two the
 * pair, two the number. One seller on each other pile.
 */
const SELLERS = [
  codeOf(MY_PILE, 'F', 27, 212),
  codeOf(MY_PILE, 'F', 72, 47),
  codeOf(MY_PILE, 'U', 27, 47),
  codeOf(MY_PILE, 'U', 14, 212),
  codeOf(1, 'K', 52, 133),
  codeOf(5, 'A', 8, 301),
  codeOf(7, 'L', 61, 18),
];
/** Piles on the table, in the order of the digits */
const PILES = [1, MY_PILE, 5, 7];
const BASKETS = SELLERS.filter((seller) => sortMark(seller).pile === MY_PILE);
/** Labels per seller */
const PER_BASKET = 2;

interface Label {
  id: number;
  seller: number;
  title: string;
  size: string;
  price: number;
}

/** Two labels per seller, mixed as they come back from the hall; the same on every load */
function makeLabels(items: { title: string; size: string }[], order: number[]): Label[] {
  const sellers = SELLERS.flatMap((seller) => Array<number>(PER_BASKET).fill(seller));
  const labels = sellers.map((seller, index) => ({
    id: index,
    seller,
    title: items[index % items.length].title,
    size: items[index % items.length].size,
    price: 3 + ((index * 7) % 12) + (index % 2) / 2,
  }));
  return order.map((index) => labels[index]).filter(Boolean);
}

const LABEL_COUNT = SELLERS.length * PER_BASKET;
const FIRST_ORDER = [5, 9, 0, 12, 3, 8, 13, 1, 6, 11, 2, 10, 4, 7];

function shuffled(count: number): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const pileOf = (seller: number) => sortMark(seller).pile;

type Phase = 'piles' | 'baskets' | 'done';

/**
 * A heap of returned labels to sort as helpers do after a bazaar with universal labels:
 * first all onto piles by the large digit, then the player takes pile 3 and sorts it into
 * its baskets, which look much alike. The labels are the printed ones, small or large.
 * Tap the right place, or drag the label there.
 */
export function SortingGame() {
  const { t } = useTranslation('company');
  const items = t('labelsPage.game.items', { returnObjects: true }) as {
    title: string;
    size: string;
  }[];
  const [order, setOrder] = useState(FIRST_ORDER);
  const [format, setFormat] = useState<LabelFormat>('small');
  const labels = makeLabels(items, order);

  const [phase, setPhase] = useState<Phase>('piles');
  /** Labels sorted in this phase */
  const [placed, setPlaced] = useState(0);
  const [wrong, setWrong] = useState<string>();
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState<number>();
  const [seconds, setSeconds] = useState(0);
  const [hint, setHint] = useState<string>();

  // The second step: only the pile of the player
  const mine = labels.filter((label) => pileOf(label.seller) === MY_PILE);
  const queue = phase === 'piles' ? labels : mine;
  const current = phase === 'done' ? undefined : queue[placed];
  const done = queue.slice(0, placed);
  const total = labels.length + mine.length;
  const progress =
    phase === 'piles' ? placed : phase === 'baskets' ? labels.length + placed : total;

  useEffect(() => {
    if (startedAt === undefined || phase === 'done') return;
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [startedAt, phase]);

  const drop = (target: string) => {
    if (!current) return;
    setStartedAt((started) => started ?? Date.now());
    const right =
      phase === 'piles'
        ? target === `pile-${pileOf(current.seller)}`
        : target === `basket-${current.seller}`;
    if (!right) {
      setMistakes((count) => count + 1);
      setWrong(target);
      setHint(
        phase === 'piles'
          ? t('labelsPage.game.hintPile', { pile: pileOf(current.seller) })
          : t('labelsPage.game.hintBasket')
      );
      setTimeout(() => setWrong(undefined), 450);
      return;
    }
    setHint(undefined);
    if (placed + 1 < queue.length) return setPlaced(placed + 1);
    setPlaced(0);
    setPhase(phase === 'piles' ? 'baskets' : 'done');
  };

  const restart = () => {
    setOrder(shuffled(LABEL_COUNT));
    setPhase('piles');
    setPlaced(0);
    setMistakes(0);
    setStartedAt(undefined);
    setSeconds(0);
    setHint(undefined);
  };

  const inPile = (pile: number) => {
    const ofPile = (list: Label[]) => list.filter((label) => pileOf(label.seller) === pile).length;
    if (phase === 'piles') return ofPile(done);
    // The player's pile empties into the baskets; the others stay with other helpers
    if (pile === MY_PILE) return phase === 'baskets' ? mine.length - placed : 0;
    return ofPile(labels);
  };
  const inBasket = (seller: number) =>
    phase === 'done'
      ? PER_BASKET
      : phase === 'baskets'
        ? done.filter((label) => label.seller === seller).length
        : 0;

  const step = phase === 'piles' ? 1 : 2;
  const small = format === 'small';

  return (
    <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
      {/* Steps, label size and time */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/40 px-4 py-3 sm:px-6">
        <ol className="flex items-center gap-1.5 text-sm font-semibold">
          {[1, 2].map((number) => (
            <li
              key={number}
              aria-current={number === step && phase !== 'done' ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
                phase === 'done' || number < step
                  ? 'bg-success-soft text-success-soft-foreground'
                  : number === step
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground'
              )}
            >
              {phase === 'done' || number < step ? (
                <Check className="size-3.5" />
              ) : (
                <span className="tabular-nums">{number}</span>
              )}
              {number === 1
                ? t('labelsPage.game.step1')
                : t('labelsPage.game.step2', { pile: MY_PILE })}
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-3">
          <div
            role="radiogroup"
            aria-label={t('labelsPage.game.format')}
            className="inline-flex rounded-full border bg-card p-0.5 text-xs font-semibold"
          >
            {(['small', 'standard'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={format === value}
                onClick={() => setFormat(value)}
                className={cn(
                  'rounded-full px-3 py-1 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                  format === value
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t(`labelsPage.game.${value}`)}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
            <span className="inline-flex items-center gap-1">
              <Timer className="size-4" /> {t('labelsPage.game.seconds', { count: seconds })}
            </span>
            <span>{t('labelsPage.game.progress', { done: progress, total })}</span>
            {/* Mistakes count from the first one, not only in the result at the end */}
            {mistakes > 0 && (
              <span className="text-destructive">
                {t('labelsPage.game.mistakes', { count: mistakes })}
              </span>
            )}
          </p>
        </div>
      </div>

      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-tag text-tag-foreground">
            <Trophy className="size-8" />
          </span>
          <p className="text-2xl font-extrabold">
            {t('labelsPage.game.doneTitle', { count: total, seconds })}
          </p>
          <p className="max-w-md text-pretty text-muted-foreground">
            {mistakes === 0
              ? t('labelsPage.game.donePerfect')
              : t('labelsPage.game.doneMistakes', { count: mistakes })}
          </p>
          <Button onClick={restart} variant="outline" size="lg">
            <RotateCcw /> {t('labelsPage.game.again')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-8">
          {/* The heap with the label in hand on top */}
          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-sm font-medium text-muted-foreground" aria-live="polite">
              {phase === 'piles'
                ? t('labelsPage.game.taskPile')
                : t('labelsPage.game.taskBasket', { pile: MY_PILE })}
            </p>
            <div className={cn('relative w-full', small ? 'h-36 sm:h-40' : 'h-56 sm:h-72')}>
              {/* The heap below: blank backs, only the label in hand is readable */}
              {queue.slice(placed + 1, placed + 4).map((label, index) => (
                <div
                  key={label.id}
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-x-0 top-2 mx-auto rounded-sm bg-white shadow-md ring-1 ring-black/15',
                    small ? 'aspect-[47.5/27.7] w-52 sm:w-60' : 'aspect-[63.3/69.25] w-44 sm:w-56'
                  )}
                  style={{
                    transform: `rotate(${[-6, 5, -3][index]}deg) translateY(${(index + 1) * 4}px)`,
                    zIndex: 3 - index,
                  }}
                />
              ))}
              {current && (
                <DraggableLabel
                  key={`${phase}-${current.id}`}
                  label={current}
                  format={format}
                  onDrop={drop}
                />
              )}
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hand className="size-3.5" /> {t('labelsPage.game.how')}
            </p>
          </div>

          {/* Where it goes */}
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {PILES.map((pile) => {
                const color = SORT_COLORS[pile];
                const enabled = phase === 'piles';
                const others = phase === 'baskets' && pile !== MY_PILE;
                return (
                  <button
                    key={pile}
                    type="button"
                    data-drop={`pile-${pile}`}
                    disabled={!enabled}
                    onClick={() => drop(`pile-${pile}`)}
                    aria-label={t('labelsPage.game.pile', { pile })}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed p-2 transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:p-3',
                      enabled && 'hover:border-primary hover:bg-accent',
                      others && 'opacity-40',
                      phase === 'baskets' &&
                        pile === MY_PILE &&
                        'border-solid border-primary bg-primary/5',
                      wrong === `pile-${pile}` &&
                        'animate-shake border-destructive bg-destructive/10'
                    )}
                  >
                    <span
                      className="flex size-11 items-center justify-center rounded-xl font-display text-2xl font-extrabold shadow-sm sm:size-14 sm:text-3xl"
                      style={{
                        background: `rgb(${color.fill.join(' ')})`,
                        color: `rgb(${color.ink.join(' ')})`,
                      }}
                    >
                      {pile}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {others ? (
                        <span className="inline-flex items-center gap-1 max-sm:sr-only">
                          <Users className="size-3" />
                          {t('labelsPage.game.otherHelper')}
                        </span>
                      ) : (
                        <>
                          <span className="sm:hidden" aria-hidden>
                            {inPile(pile)}
                          </span>
                          <span className="max-sm:sr-only">
                            {t('labelsPage.game.labels', { count: inPile(pile) })}
                          </span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            {phase === 'piles' ? (
              <p className="flex items-center gap-2 rounded-2xl border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
                <ShoppingBasket className="size-4 shrink-0" />
                {t('labelsPage.game.basketsLater', { count: BASKETS.length, pile: MY_PILE })}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {BASKETS.map((seller) => {
                  const enabled = phase === 'baskets';
                  return (
                    <button
                      key={seller}
                      type="button"
                      data-drop={`basket-${seller}`}
                      disabled={!enabled}
                      onClick={() => drop(`basket-${seller}`)}
                      aria-label={t('labelsPage.game.basket', { count: inBasket(seller) })}
                      className={cn(
                        'flex items-center gap-2 rounded-2xl border bg-background p-2 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:gap-3 sm:p-3',
                        enabled && 'border-primary/60 hover:border-primary hover:bg-accent',
                        wrong === `basket-${seller}` &&
                          'animate-shake border-destructive bg-destructive/10'
                      )}
                    >
                      <ShoppingBasket className="size-5 shrink-0 text-muted-foreground max-sm:hidden" />
                      <span className="min-w-0 flex-1">
                        <SortMarkBadge code={seller} className="h-11 max-w-full sm:h-12" />
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                        {inBasket(seller)}/{PER_BASKET}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="min-h-5 text-sm font-medium text-destructive" aria-live="assertive">
              {hint}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** A label as printed, lying on the table */
function LabelCard({
  label,
  format,
  className,
}: {
  label: Label;
  format: LabelFormat;
  className?: string;
}) {
  return (
    <PrintedLabel
      format={format}
      label={{ title: label.title, size: label.size, price: label.price, sortCode: label.seller }}
      className={cn('w-full rounded-sm shadow-md ring-1 ring-black/15', className)}
    />
  );
}

/** The label in hand: drag it onto a pile or basket; tapping the target works as well. */
function DraggableLabel({
  label,
  format,
  onDrop,
}: {
  label: Label;
  format: LabelFormat;
  onDrop: (target: string) => void;
}) {
  const [offset, setOffset] = useState<{ x: number; y: number }>();
  const start = useRef<{ x: number; y: number }>(undefined);
  const card = useRef<HTMLDivElement>(null);

  const down = (event: ReactPointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };
  const move = (event: ReactPointerEvent) => {
    if (!start.current) return;
    setOffset({ x: event.clientX - start.current.x, y: event.clientY - start.current.y });
  };
  const up = (event: ReactPointerEvent) => {
    if (!start.current) return;
    start.current = undefined;
    setOffset(undefined);
    // What lies under the pointer, the label itself left out
    const element = card.current;
    if (element) element.style.visibility = 'hidden';
    const below = document.elementFromPoint(event.clientX, event.clientY);
    if (element) element.style.visibility = '';
    const target = below?.closest<HTMLElement>('[data-drop]:not(:disabled)');
    if (target?.dataset.drop) onDrop(target.dataset.drop);
  };

  return (
    <div
      ref={card}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = undefined;
        setOffset(undefined);
      }}
      className={cn(
        'absolute inset-x-0 top-0 z-10 mx-auto cursor-grab touch-none select-none animate-in fade-in-0 zoom-in-95 duration-200',
        format === 'small' ? 'w-56 sm:w-64' : 'w-48 sm:w-60',
        offset && 'cursor-grabbing'
      )}
      style={{
        transform: `translate(${offset?.x ?? 0}px, ${offset?.y ?? 0}px) rotate(${offset ? 3 : 0}deg)`,
        transition: offset ? 'none' : 'transform 150ms',
      }}
    >
      <LabelCard label={label} format={format} className="shadow-xl" />
    </div>
  );
}
