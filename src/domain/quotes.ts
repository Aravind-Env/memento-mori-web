export interface Quote {
  text: string
  author: string
}

/** Offline library of Stoic and memento mori quotes. */
export const QUOTES: Quote[] = [
  { text: 'You could leave life right now. Let that determine what you do and say and think.', author: 'Marcus Aurelius' },
  { text: 'It is not that we have a short time to live, but that we waste much of it.', author: 'Seneca' },
  { text: 'Remember, you are mortal; remember, your time is limited.', author: 'Memento Mori' },
  { text: 'Waste no more time arguing what a good person should be. Be one.', author: 'Marcus Aurelius' },
  { text: 'Begin at once to live, and count each separate day as a separate life.', author: 'Seneca' },
  { text: 'The whole future lies in uncertainty: live immediately.', author: 'Seneca' },
  { text: 'Think of yourself as dead. You have lived your life. Now take what is left and live it properly.', author: 'Marcus Aurelius' },
  { text: 'He who fears death will never do anything worthy of a living man.', author: 'Seneca' },
  { text: 'Not death, but a well-done or ill-done life, is the thing to be considered.', author: 'Epictetus' },
  { text: 'Let us prepare our minds as if we had come to the very end of life.', author: 'Seneca' },
  { text: 'As long as you live, keep learning how to live.', author: 'Seneca' },
  { text: 'You are a little soul carrying about a corpse.', author: 'Epictetus' },
  { text: 'Nothing is ours except time.', author: 'Seneca' },
  { text: 'Do not act as if you were going to live ten thousand years. Death hangs over you.', author: 'Marcus Aurelius' },
  { text: 'If you wish to be a writer, write.', author: 'Epictetus' },
  { text: 'How soon will the forgetful world cover you?', author: 'Marcus Aurelius' },
  { text: 'No man is free who is not master of himself.', author: 'Epictetus' },
  { text: 'While we wait for life, life passes.', author: 'Seneca' },
  { text: 'The present is all we possess.', author: 'Marcus Aurelius' },
  { text: 'First say to yourself what you would be; then do what you have to do.', author: 'Epictetus' },
  { text: 'To live each day as if it were your last without frenzy or numbness.', author: 'Marcus Aurelius' },
  { text: 'It is the power of the mind to be unconquerable.', author: 'Seneca' },
  { text: 'Death smiles at us all; all we can do is smile back.', author: 'Marcus Aurelius' },
  { text: 'Luck is what happens when preparation meets opportunity.', author: 'Seneca' },
  { text: 'We suffer more in imagination than in reality.', author: 'Seneca' },
  { text: 'The best revenge is to be unlike the one who did the injury.', author: 'Marcus Aurelius' },
  { text: 'Difficulties strengthen the mind, as labour does the body.', author: 'Seneca' },
  { text: 'Life is long if you know how to use it.', author: 'Seneca' },
  { text: 'What we do now echoes in eternity.', author: 'Marcus Aurelius' },
  { text: 'One day is always the first day of the rest of your life.', author: 'Memento Mori' },
]

/** Deterministic quote for a given date so it stays stable all day. */
export function getDailyQuote(today: Date = new Date()): Quote {
  const days = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000)
  const index = ((days % QUOTES.length) + QUOTES.length) % QUOTES.length
  return QUOTES[index]
}
