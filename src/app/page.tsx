import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DemoBanner } from '@/components/app/DemoBanner';
import { AuditProof, EvidenceProof, ReadingProof, RecyclingProof } from '@/components/landing/Fragments';
import { HeroBattery } from '@/components/landing/HeroBattery';
import { Lifecycle, OpenPassport, QuestionList, Reveals, RulesDemo, type Picture, type Question } from '@/components/landing/Interactive';
import { Marquee } from '@/components/landing/Marquee';
import { Motion } from '@/components/landing/Motion';
import { Pointer } from '@/components/landing/Pointer';
import { PlateField } from '@/components/landing/PlateField';
import { Words } from '@/components/landing/Words';
import './landing.css';

/**
 * Two drawings made for this page and two public-domain photographs of lead. Nothing here shows Synovra, its
 * sites or its customers, and each caption says what the picture is.
 */
const PICTURES: Picture[] = [
  {
    alt: 'Plates of lead standing in a row, lit from below in copper.',
    caption: 'Plates of lead stand in every cell of a battery. The record follows the battery they live in.',
    art: <PlateField tone="copper" seed={1} />,
  },
  {
    alt: 'Plates of lead standing in a row, lit from below in teal.',
    caption: 'Evidence is what a test measured, on which instrument, and who signed it off.',
    art: <PlateField tone="teal" seed={4} />,
  },
  {
    src: '/landing/roman-lead-ingots.jpg', width: 1920, height: 1440, focus: '30% 50%',
    alt: "Two Roman lead ingots in a museum case, cast with the emperor Vespasian's name along the top",
    caption: 'Roman lead, cast with the name of the emperor it was made under. Lead has carried its record before.',
    title: 'Lead ingots', by: 'Rodw', licence: 'public domain',
    url: 'https://commons.wikimedia.org/wiki/File:Lead_ingots.JPG',
  },
  {
    src: '/landing/port-pirie-ingots-1925.jpg', width: 1920, height: 1440, focus: '50% 50%',
    alt: 'Stacks of lead ingots in the yard of a smelting works, with water tanks and a chimney behind, around 1925',
    caption: 'Lead ingots at the Port Pirie smelting works, around 1925. Lead is recovered and recast.',
    title: 'Lead Ingots at Smelting Works Port Pirie (c. 1925)', by: 'South Australian Government photographer', licence: 'public domain',
    url: 'https://commons.wikimedia.org/wiki/File:Lead_Ingots_at_Smelting_Works_Port_Pirie(GN07923).jpg',
  },
];

/** `pic` is the picture the question turns the panel to. */
const QUESTIONS: Question[] = [
  { q: 'Which batteries are safe to allocate?', where: 'Qualified status', pic: 0, more: 'Only batteries an engineer qualified, each with the test behind the decision. Units still waiting for review are listed apart.' },
  { q: 'Where has it been installed, and when?', where: 'Movement history', pic: 0, more: 'Every site and position it has served in, with dates, so a returned battery comes back with its history.' },
  { q: 'Is this a handling or a warranty issue?', where: 'Tests and readings', pic: 0, more: 'A claim links to the battery’s tests and telemetry, so the finding rests on what was measured.' },
  { q: 'On what evidence was it qualified?', where: 'Test and reviewer', pic: 1, more: 'The final test with its instrument, calibration and protocol revision, and the engineer’s written reason.' },
  { q: 'What did restoring it cost?', where: 'Cost entries', pic: 1, more: 'Each attempt’s costs, marked direct, allocated or estimated. A total with a missing entry says it is incomplete.' },
  { q: 'What happened before it reached the site?', where: 'Passport timeline', pic: 2, more: 'Intake, tests, restoration and decisions in order, on one identity that never changes.' },
  { q: 'Who changed this record, and why?', where: 'Audit log', pic: 2, more: 'Every change and every refusal, with the person, the time and the reason they gave.' },
  { q: 'Where did it go when it left service?', where: 'Consignment record', pic: 3, more: 'The recycler, the consignment reference and the mass handed over.' },
  { q: 'Has the recycler confirmed it?', where: 'Certificate state', pic: 3, more: 'Received or not received. The record never assumes a certificate it has not seen.' },
];

const RULES: { title: string; text: string; aside: string; proof: ReactNode }[] = [
  {
    title: 'Refusals are recorded',
    text: 'Every read and write is checked against the reader’s role, where the data is held. A refused action is logged with who tried, what and why.',
    aside: 'An administrator manages people and roles, and cannot qualify a battery either.',
    proof: <AuditProof />,
  },
  {
    title: 'Evidence keeps its fingerprint',
    text: 'Test reports, photographs and calibration certificates are kept with a SHA-256 checksum and a classification.',
    aside: 'A customer sees only the files marked as customer-visible.',
    proof: <EvidenceProof />,
  },
  {
    title: 'Readings say where they came from',
    text: 'Telemetry arrives from a gateway mapped to a battery position. A mapping nobody has verified is marked unverified, and an empty position says not mapped.',
    aside: 'The sensors and gateways in this demonstration are generated.',
    proof: <ReadingProof />,
  },
  {
    title: 'Recycling closes the record',
    text: 'When a battery leaves service, the consignment and the recycler’s certificate join its passport.',
    aside: 'Until the certificate arrives, the record says not received. The recycler here is a placeholder.',
    proof: <RecyclingProof />,
  },
];

const ABSENT: [string, string][] = [
  ['Cloud platform and database', 'Browser only'],
  ['Battery sensors and gateways', 'Generated'],
  ['Trained machine-learning models', 'None'],
  ['Identity provider', 'Demo roles'],
  ['Certifications', 'None claimed'],
  ['Customers', 'None; names invented'],
];

const JOURNEY = ['Intake', 'Test', 'Restoration', 'Qualification', 'Deployment', 'Recycling'];

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="1" y="5" width="26" height="20" rx="5" fill="#231E19" stroke="#fff" strokeOpacity="0.14" />
      <rect x="6" y="2" width="5" height="4" rx="1" fill="#6B6359" />
      <rect x="17" y="2" width="5" height="4" rx="1" fill="#C2652F" />
      <path d="M7 16.5h4l2.2-5 3 8 2.2-3H21" stroke="#F2A877" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A floating bar that stays under the demonstration notice. Glass over whatever scrolls beneath it. */
function Nav() {
  return (
    <div className="lp-navwrap">
      <nav className="lp-nav" aria-label="Site">
        <Link href="/" className="lp-mark" aria-label="Synovra Battery Intelligence, home">
          <Mark size={26} />
          <span>Synovra</span>
        </Link>
        <ul className="lp-nav-links">
          <li><a className="lp-link" href="#lifecycle">How it works</a></li>
          <li><a className="lp-link" href="#rules">Try the rules</a></li>
          <li><a className="lp-link" href="#questions">Questions</a></li>
          <li><a className="lp-link" href="#honesty">What is real</a></li>
        </ul>
        <Link className="lp-nav-cta" href="/signin" data-magnet>Demo sign-in</Link>
      </nav>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <DemoBanner />
      <div className="lp-progress" aria-hidden />
      <Nav />
      <Reveals />
      <Motion />
      <Pointer />
      <main id="main">
        {/* the first screen: one object, one sentence, one action */}
        <section className="lp-hero lp-grain" data-hero data-scene="leave" aria-label="Synovra Battery Intelligence">
          <div className="lp-hero-light" aria-hidden />
          <div className="lp-hero-copy">
            <p className="lp-eyebrow" data-rise>Synovra · Battery Intelligence</p>
            <h1 className="lp-h1">
              <span className="lp-line"><span data-line style={{ ['--i' as string]: 0 }}>Every battery,</span></span>{' '}
              <span className="lp-line"><span data-line style={{ ['--i' as string]: 1 }}><em>on the record.</em></span></span>
            </h1>
            <p className="lp-sub" data-rise style={{ ['--i' as string]: 3 }}>
              One passport for each lead-acid battery, from intake to recycling. Every claim on it points to the record behind it.
            </p>
            <div className="lp-cta-row" data-rise style={{ ['--i' as string]: 4 }}>
              <Link className="lp-btn" href="/signin" data-magnet>Open the demo</Link>
              <a className="lp-textlink" href="#lifecycle">See how it works <span aria-hidden>↓</span></a>
            </div>
          </div>
          <div className="lp-hero-object">
            <HeroBattery />
          </div>
          <div className="lp-hero-foot" data-rise style={{ ['--i' as string]: 5 }}>
            <ol className="lp-journey" aria-label="The stages a battery's record follows">
              {JOURNEY.map((j) => <li key={j}>{j}</li>)}
            </ol>
            <p className="lp-illus">Illustration of a 12 V lead-acid battery in cutaway. Not a photograph or scan of any Synovra battery.</p>
          </div>
        </section>

        {/* a sentence that fills in as it is read */}
        <section className="lp-fill" data-scene="pin" aria-label="Why a record matters">
          <div className="lp-fill-in">
            <p className="lp-fill-big"><Words text="A used battery is only as good as the record behind it." /></p>
            <p className="lp-fill-small" data-reveal>
              Synovra keeps that record for lead-acid batteries: what was measured and on which instrument, what was done to the battery, who decided, and what it cost.
            </p>
          </div>
        </section>

        <Lifecycle />

        {/* an interlude in photographs: the oldest record on lead */}
        <section className="lp-interlude lp-grain" data-scene="through" aria-label="Lead and its records">
          <Image
            src="/landing/roman-lead-ingots.jpg" alt="" width={1920} height={1440} sizes="100vw"
            className="lp-interlude-img" style={{ objectPosition: '30% 55%' }}
          />
          <div className="lp-interlude-shade" aria-hidden />
          <div className="lp-interlude-copy">
            <p className="lp-eyebrow" data-reveal>Lead keeps records</p>
            <p className="lp-interlude-line" data-reveal style={{ ['--i' as string]: 1 }}>
              Nearly two thousand years ago, a lead ingot was cast with the name of the emperor it was made under.
            </p>
            <p className="lp-credit" data-reveal style={{ ['--i' as string]: 2 }}>
              <a href="https://commons.wikimedia.org/wiki/File:Lead_ingots.JPG" rel="noopener noreferrer" target="_blank">Lead ingots</a>, Rodw, public domain, via Wikimedia Commons.
            </p>
          </div>
        </section>

        <div className="lp-sheet-paper">
          <RulesDemo />

          <section className="lp-enf" aria-labelledby="enf-h">
            <div className="lp-enf-head">
              <p className="lp-eyebrow" data-reveal>Beyond the first four</p>
              <h2 id="enf-h" className="lp-h2" data-reveal style={{ ['--i' as string]: 1 }}>What it <em>enforces</em></h2>
              <p className="lp-lead" data-reveal style={{ ['--i' as string]: 2 }}>
                Beyond the rules you just tried, the record keeps four more. Each is shown here the way the product shows it.
              </p>
            </div>
            {RULES.map((r, n) => (
              <article className="lp-mod" key={r.title}>
                <div className="lp-mod-panel" data-reveal data-spot>{r.proof}</div>
                <div className="lp-mod-text">
                  <span className="lp-num" aria-hidden data-reveal>0{n + 1}</span>
                  <h3 data-reveal style={{ ['--i' as string]: 1 }}>{r.title}</h3>
                  <p data-reveal style={{ ['--i' as string]: 2 }}>{r.text}</p>
                  <p data-reveal style={{ ['--i' as string]: 3 }}>{r.aside}</p>
                </div>
              </article>
            ))}
          </section>
        </div>

        <QuestionList rows={QUESTIONS} pictures={PICTURES} />

        <div className="lp-sheet-paper lp-sheet-paper-2">
          <section className="lp-about" id="honesty" aria-label="What is real in this demonstration">
            <div className="lp-letter">
              <span className="lp-letter-mark" data-reveal><Mark size={26} /></span>
              <p className="lp-letter-lead" data-reveal>
                This is a demonstration build, and it says so on every screen. The batteries, sites, people and figures in it are invented, and nothing connects to a live customer, cloud or sensor.
              </p>
              <p data-reveal>
                What is real is the record model and its rules: who may see what, what counts as evidence, and that qualifying a battery is always a person&apos;s decision.
              </p>
              <p data-reveal>
                We built it for the people who handle used lead-acid batteries: restoration teams, battery engineers and lab technicians, the operators who install them, and the customers who need to know what they are getting.
              </p>
              <p data-reveal>
                Open it as any of seven roles. Each sees the same battery differently, because the rules are checked on every read and write. The same screens also run against the Synovra API, with PostgreSQL, company sign-in and stored evidence files.
              </p>
              <p className="lp-sign" data-reveal>
                <span>The Synovra team</span>
                <span>Written for this demonstration, October 2026</span>
              </p>
            </div>
            <div className="lp-absent">
              <h2 data-reveal>What this demonstration does not have</h2>
              <ul data-reveal style={{ ['--i' as string]: 1 }}>
                {ABSENT.map(([what, state]) => (
                  <li key={what} data-spot><span>{what}</span><span>{state}</span></li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <section className="lp-cta lp-grain" aria-labelledby="cta-h">
          <div className="lp-cta-glow" aria-hidden />
          <div className="lp-cta-text">
            <h2 id="cta-h" data-reveal>
              <span>Open a</span> <span><em>passport.</em></span>
            </h2>
            <p data-reveal style={{ ['--i' as string]: 1 }}>
              Choose a label and a reader. The button signs you in to the demonstration as that role and opens the battery&apos;s passport. Everything in it is synthetic.
            </p>
          </div>
          <OpenPassport />
        </section>
      </main>

      <footer className="lp-foot lp-grain" data-scene="enter">
        <Marquee words={JOURNEY} />
        <div className="lp-foot-glow" aria-hidden />
        <div className="lp-foot-in" data-open>
          <div className="lp-foot-top">
            <div className="lp-foot-lead" data-f style={{ ['--i' as string]: 0 }}>
              <p className="lp-foot-tag">Every battery,<br /> <em>on the record.</em></p>
              <p className="lp-foot-note">One passport per lead-acid battery, from intake to recycling. Every value says where it came from.</p>
            </div>
            <nav className="lp-foot-nav" aria-label="Footer" data-f style={{ ['--i' as string]: 1 }}>
              <div>
                <p className="lp-foot-h">Explore</p>
                <Link href="/signin" data-magnet>Demo sign-in<span className="lp-arr" aria-hidden>→</span></Link>
                <a href="#lifecycle" data-magnet>How it works<span className="lp-arr" aria-hidden>↑</span></a>
                <a href="#honesty" data-magnet>What is real<span className="lp-arr" aria-hidden>↑</span></a>
              </div>
              <div>
                <p className="lp-foot-h">Project</p>
                <a href="https://github.com/KNambiarDJsc/Energy_Platform_Synovra" rel="noopener noreferrer" data-magnet>Source and docs<span className="lp-arr" aria-hidden>↗</span></a>
                <a className="lp-totop" href="#main" data-magnet><span aria-hidden>↑</span> Back to top</a>
              </div>
            </nav>
          </div>
          <div className="lp-foot-sign">
            <p className="lp-wm" aria-hidden data-letters>
              {'Synovra'.split('').map((ch, i) => <span key={i} style={{ ['--i' as string]: i }}>{ch}</span>)}
            </p>
            <div className="lp-foot-base" data-f style={{ ['--i' as string]: 3 }}>
              <span>Synovra Battery Intelligence, demonstration build</span>
              <span>2026 · Synthetic data only</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
