import { pick } from './random'

/**
 * Short public-domain passages for the typing task. `pickPassage` chooses one
 * whose word count falls in [minWords, maxWords] (or the closest if none fit),
 * giving the flow builder a rough length/difficulty knob.
 */
const PASSAGES: string[] = [
  'The quick brown fox jumps over the lazy dog.',
  'All that we see or seem is but a dream within a dream.',
  'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness.',
  'Two roads diverged in a yellow wood, and sorry I could not travel both and be one traveler, long I stood and looked down one as far as I could.',
  'I have not failed. I have just found ten thousand ways that will not work. Genius is one percent inspiration and ninety-nine percent perspiration.',
  'In the beginning the Universe was created. This has made a lot of people very angry and been widely regarded as a bad move. Space is big, really big.',
  'We hold these truths to be self-evident, that all are created equal, that they are endowed with certain unalienable rights, among these life, liberty, and the pursuit of happiness.',
  'Call me Ishmael. Some years ago, having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world.',
]

const wordCount = (text: string): number => text.trim().split(/\s+/).length

/** Pick a passage whose length is within [minWords, maxWords], else the closest. */
export function pickPassage(minWords: number, maxWords: number): string {
  const lo = Math.min(minWords, maxWords)
  const hi = Math.max(minWords, maxWords)
  const inRange = PASSAGES.filter((p) => {
    const w = wordCount(p)
    return w >= lo && w <= hi
  })
  if (inRange.length) return pick(inRange)
  // Nothing fits: fall back to the passage closest to the midpoint.
  const target = (lo + hi) / 2
  return [...PASSAGES].sort(
    (a, b) => Math.abs(wordCount(a) - target) - Math.abs(wordCount(b) - target),
  )[0]
}
