import './StoicLifeAnimation.css'

const quotes = [
  {
    text: 'You have power over your mind, not outside events.',
    author: 'Marcus Aurelius',
  },
  {
    text: 'It is not that we have a short time to live, but that we waste much of it.',
    author: 'Seneca',
  },
  {
    text: 'The happiness of your life depends upon the quality of your thoughts.',
    author: 'Marcus Aurelius',
  },
]

export default function StoicLifeAnimation() {
  const quote = quotes[0]

  return (
    <section className="stoic-scene" aria-label="Stoic reflection">
      <div className="stoic-sky" />

      <div className="stoic-sun" />

      <svg
        className="stoic-landscape"
        viewBox="0 0 900 340"
        preserveAspectRatio="xMidYMax meet"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="farMountain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c6bcb5" />
            <stop offset="100%" stopColor="#e9ddd2" />
          </linearGradient>

          <linearGradient id="nearMountain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8c8888" />
            <stop offset="100%" stopColor="#34343c" />
          </linearGradient>

          <linearGradient id="sceneFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="30%" stopColor="white" stopOpacity=".9" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Distant mountain range */}
        <path
          d="M0 245 L100 205 L175 225 L270 170 L340 215
             L450 155 L525 200 L640 115 L735 195 L900 155
             L900 340 L0 340Z"
          fill="url(#farMountain)"
          opacity=".55"
        />

        {/* Mountain peaks */}
        <path
          d="M310 260 L450 175 L505 208 L610 105
             L690 190 L750 225 L900 190 L900 340 L310 340Z"
          fill="#b6aaa4"
          opacity=".6"
        />

        {/* Foreground hills */}
        <path
          d="M0 275 Q120 220 240 260 T470 250
             Q590 210 710 265 T900 235 L900 340 L0 340Z"
          fill="url(#nearMountain)"
          opacity=".6"
        />

        {/* A quiet walking path */}
        <path
          d="M140 340 Q260 285 380 310 T620 340"
          fill="none"
          stroke="#f3d2b8"
          strokeWidth="3"
          opacity=".65"
        />

        {/* Walking silhouette */}
        <g className="stoic-walker" transform="translate(190 252)">
          <circle cx="0" cy="-36" r="6" fill="#34343c" />
          <path d="M-5 -28 L-9 -5 L-3 2 L3 -4 L6 -27Z" fill="#34343c" />
          <path
            d="M-6 -24 L-18 -11 L-15 -8 L-3 -17
               M5 -23 L15 -12 L12 -9 L2 -17"
            fill="none"
            stroke="#34343c"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <g className="stoic-legs">
            <path
              d="M-3 -5 L-12 13 L-16 25
                 M2 -5 L9 10 L17 18"
              fill="none"
              stroke="#34343c"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* Flying birds */}
        <g className="stoic-birds" fill="none" stroke="#80736d" strokeWidth="2.5" strokeLinecap="round">
          <path d="M540 85 q9 -12 18 0 q9 -12 18 0" />
          <path d="M610 120 q7 -9 14 0 q7 -9 14 0" />
          <path d="M480 130 q6 -7 12 0 q6 -7 12 0" />
        </g>

        {/* Soft fade at the left edge */}
        <rect width="900" height="340" fill="url(#sceneFade)" />
      </svg>

      <div className="stoic-reflection">
        <span className="stoic-eyebrow">A MOMENT OF STOICISM</span>
        <p key={quote.text} className="stoic-quote">
          “{quote.text}”
        </p>
        <span className="stoic-author">— {quote.author}</span>
      </div>
    </section>
  )
}
