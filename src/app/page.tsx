import "@/app/workspace-styles";
import Link from "next/link";
import LandingThreeHero from "@/components/landing-three-hero";
import styles from "@/components/landing-three.module.css";

const collections = [
  {
    number: "01",
    title: "Lower Secondary",
    route: "/lowersecondary",
    label: "Build strong foundations",
    description: "Class 9 and Class 10 resources together in one learning library.",
    symbol: "Ⅱ",
  },
  {
    number: "02",
    title: "Science",
    route: "/science",
    label: "Explore the natural world",
    description: "Clear notes for biology, chemistry, physics, and mathematics.",
    symbol: "✳",
  },
  {
    number: "03",
    title: "Commerce",
    route: "/commerce",
    label: "Understand how things work",
    description: "Business, economics, accounting, and practical knowledge.",
    symbol: "◈",
  },
  {
    number: "04",
    title: "Humanities",
    route: "/humanities",
    label: "Ideas, people, and society",
    description: "History, civics, culture, and critical perspectives.",
    symbol: "⌘",
  },
  {
    number: "05",
    title: "Developers",
    route: "/developers",
    label: "Build and contribute",
    description: "Project documentation, guides, and contributor resources.",
    symbol: "››",
  },
];

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="NoteBooks home">
          <span className={styles.brandMark} aria-hidden="true">n</span>
          <span>NoteBooks</span>
        </Link>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a href="#collections">Collections</a>
          <Link href="/developers">About</Link>
          <Link className={styles.accountLink} href="/account">Your study space <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span aria-hidden="true" /> A CALMER WAY TO LEARN</p>
          <h1 id="landing-title">Make room for <em>understanding.</em></h1>
          <p className={styles.heroLead}>
            A thoughtful library for studying deeply and finding your way back to what matters.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/lowersecondary">
              Explore the library <span aria-hidden="true">↗</span>
            </Link>
            <a className={styles.secondaryAction} href="#collections">
              Browse collections <span aria-hidden="true">↓</span>
            </a>
          </div>
          <p className={styles.heroNote}>Clear notes. Connected ideas. Space to think.</p>
        </div>

        <LandingThreeHero />

        <p className={styles.heroIndex} aria-hidden="true">NOTEBOOKS <span>·</span> A SHARED STUDY SPACE</p>
      </section>

      <section className={styles.collections} id="collections" aria-labelledby="collections-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}><span aria-hidden="true" /> FIND YOUR STARTING POINT</p>
            <h2 id="collections-title">A shared shelf for curious minds.</h2>
          </div>
          <p>Choose a subject, open a note, and follow each idea at your own pace.</p>
        </div>

        <ul className={styles.collectionGrid}>
          {collections.map((collection) => (
            <li key={collection.route}>
              <article className={styles.collectionCard}>
                <div className={styles.cardMeta}>
                  <span>{collection.number} <i>— 05</i></span>
                  <span className={styles.cardSymbol} aria-hidden="true">{collection.symbol}</span>
                </div>
                <p className={styles.cardLabel}>{collection.label}</p>
                <h3>{collection.title}</h3>
                <p className={styles.cardDescription}>{collection.description}</p>
                <Link className={styles.cardLink} href={collection.route}>
                  Explore {collection.title} <span aria-hidden="true">↗</span>
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.studySpace} aria-labelledby="study-space-title">
        <div>
          <p className={styles.eyebrow}><span aria-hidden="true" /> YOUR STUDY SPACE</p>
          <h2 id="study-space-title">Keep your learning close.</h2>
          <p>Pick up where you left off, or create an account to establish a persistent identity.</p>
        </div>
        <div className={styles.studyActions}>
          <Link href="/account">View your account <span aria-hidden="true">→</span></Link>
          <Link href="/register">Create an account <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>NoteBooks <b>·</b> A shared shelf for curious minds.</span>
        <Link href="/developers">About this library <span aria-hidden="true">↗</span></Link>
      </footer>
    </main>
  );
}
