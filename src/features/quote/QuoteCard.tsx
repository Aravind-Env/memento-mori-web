import { getDailyQuote } from '../../domain/quotes'

export function QuoteCard() {
  const quote = getDailyQuote()
  return (
    <figure className="quote">
      <blockquote>“{quote.text}”</blockquote>
      <figcaption>{quote.author}</figcaption>
    </figure>
  )
}
