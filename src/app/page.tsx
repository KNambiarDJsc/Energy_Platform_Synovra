import Link from 'next/link';
import type { ReactNode } from 'react';
import { DemoBanner } from '@/components/app/DemoBanner';
import { ExplodedBattery } from '@/components/landing/ExplodedBattery';
import { AuditProof, EvidenceProof, ReadingProof, RecyclingProof } from '@/components/landing/Fragments';
import { FluidHover } from '@/components/landing/FluidHover';
import { Lifecycle, QuestionList, Reveals, type Picture, type Question } from '@/components/landing/Interactive';
import { Menu } from '@/components/landing/Menu';
import { Motion } from '@/components/landing/Motion';
import { PlateField } from '@/components/landing/PlateField';
import { Pointer } from '@/components/landing/Pointer';
import { Slot } from '@/components/landing/Slot';
import { Solutions, type Solution } from '@/components/landing/Solutions';
import './landing.css';

/** Two drawings made for this page and two public-domain photographs of lead. Each caption says what the picture is. */
const PICTURES: Picture[] = [
  {
    alt: 'Plates of lead standing in a row, lit from below in orange.',
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
  { q: 'How are my batteries doing?', where: 'Status', pic: 0, more: 'Good, watching, needs attention, or baseline being established, from fixed rules over what is on record. Never a health score.' },
  { q: 'Which one needs attention, and why?', where: 'Reasons', pic: 0, more: 'Each battery lists the checks behind its status, with the next step from the same record.' },
  { q: 'Where is it, and where has it been?', where: 'Site, bank, string, position', pic: 0, more: 'Customer, site, system, bank or string, and position, with every move and the date it happened.' },
  { q: 'What did the last test measure?', where: 'Test and evidence', pic: 1, more: 'Capacity, resistance and voltage with the instrument, its calibration, the room temperature and the engineer who approved it.' },
  { q: 'What changed after the work?', where: 'Before and after', pic: 1, more: 'The last two approved tests side by side, each against the room it was taken in. A change is a measurement, not a promise.' },
  { q: 'When will it need replacing?', where: 'Outlook', pic: 2, more: 'Not estimated until a forecast is validated. The record says so, with the confidence, instead of inventing a window.' },
  { q: 'Can I plan maintenance or a replacement?', where: 'Actions', pic: 2, more: 'Request maintenance or plan a replacement from the battery. In this demonstration the request stays in your browser.' },
  { q: 'What do I give my ESG team?', where: 'Report', pic: 3, more: 'An evidence-backed data report: inventory, performance, lifecycle, and the energy and emissions inputs still missing.' },
  { q: 'Where did it go when it left service?', where: 'Recycling record', pic: 3, more: 'The recycler, the consignment and the mass handed over. The certificate is received or not received, never assumed.' },
];

const RULES: { title: string; text: string; aside: string; proof: ReactNode }[] = [
  {
    title: 'You see your own batteries',
    text: 'Every read is checked against the signed-in customer and their sites, where the data is held. A refusal is logged with who tried, what and why.',
    aside: 'Internal costs, process notes and confidential methods are never part of what a customer sees.',
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
  ['Replacement forecasts', 'None; not validated'],
];

/** The hero's status panel: what the record covers and how each part reaches it today. Words, not colour alone. */
const COVERAGE: [string, string, 'on' | 'sim' | 'off'][] = [
  ['Identity', 'In use', 'on'], ['Intake', 'In use', 'on'], ['Tests', 'In use', 'on'], ['Service history', 'In use', 'on'], ['Reports', 'In use', 'on'],
  ['Deployment', 'In use', 'on'], ['Telemetry', 'Simulated', 'sim'], ['Machines', 'Not connected', 'off'], ['Warranty', 'In use', 'on'], ['Recycling', 'In use', 'on'],
];

/** The hero ticker: points the product holds to, one at a time. */
const NOTES: [string, string][] = [
  ['A status, never a health score', 'Good, watching, needs attention or baseline, from fixed rules over what is on record.'],
  ['Every value says what kind it is', 'Measured, calculated, modelled or predicted, so a forecast never looks like a reading.'],
  ['A person decides', 'A rule shows what to look at. Approving a test or the work behind it is an engineer’s decision.'],
];

/** Shortened SHA-256-style prefixes, invented: the product keeps a full checksum with every evidence file. */
const HASHES = ['9f2c41ab', 'e07d85c3', '3b19f6a0', 'a4c2e911', '5d80b7f2', 'c61e03d8', '7a9b44e5', '12f0c8ad', 'b3d7621e'];

const SOLUTIONS: Solution[] = [
  { key: 'fleet', n: '01', title: 'Your fleet at a glance', text: 'One calm screen: how many batteries, how many are good, watching or need attention, and what to do next.', href: '/signin?next=%2Fapp%2Fhome', slot: 'solution-fleet', note: 'Illustration: a fleet of batteries across sites as a calm status ring.' },
  { key: 'record', n: '02', title: 'Every battery, opened up', text: 'Its identity, where it sits, its condition and why, a modelled view of the inside, and every test behind it.', href: '/signin?next=%2Fapp%2Fbatteries', slot: 'solution-record', note: 'Illustration: one battery opened as a cutaway beside its record.' },
  { key: 'actions', n: '03', title: 'Maintenance and replacement', text: 'Ask for maintenance or plan a replacement from the battery itself. Work done shows as before and after measurements.', href: '/signin?next=%2Fapp%2Factions', slot: 'solution-actions', note: 'Illustration: two tests either side of a service visit.' },
  { key: 'reports', n: '04', title: 'Reports for your paperwork', text: 'An evidence-backed data report for internal and ESG use, with measured results kept apart from estimates and gaps listed.', href: '/signin?next=%2Fapp%2Freports', slot: 'solution-reports', note: 'Illustration: a report assembling from battery records.' },
];

const PLATFORM: [string, string, string, string][] = [
  ['01', 'One identity', 'A permanent ID; the label and QR only point to it.', '#lifecycle'],
  ['02', 'Evidence', 'Tests with method, instrument and calibration, and files with checksums.', '#enforces'],
  ['03', 'Condition', 'A status from fixed rules, never a score, with the reasons.', '#questions'],
  ['04', 'History', 'Tests, service, moves and replacement, newest first.', '#questions'],
  ['05', 'Recycling', 'The consignment and the certificate that closes it.', '#honesty'],
];

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="1" y="5" width="26" height="20" rx="3" fill="currentColor" />
      <rect x="6" y="2" width="5" height="4" rx="1" fill="currentColor" />
      <rect x="17" y="2" width="5" height="4" rx="1" fill="currentColor" />
      <path d="M7 16.5h4l2.2-5 3 8 2.2-3H21" stroke="var(--mark, #ff5841)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Header() {
  return (
    <header className="lp-head">
      <Link href="/" className="lp-mark" aria-label="Synovra Battery Intelligence, home">
        <Mark size={30} />
        <span>Synovra</span>
      </Link>
      <div className="lp-head-r">
        <Link className="lp-head-cta" href="/signin">Demo sign-in</Link>
        <Menu />
      </div>
    </header>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <DemoBanner />
      <div className="lp-progress" aria-hidden />
      <Header />
      <Reveals />
      <Motion />
      <Pointer />
      <FluidHover />
      <main id="main">
        {/* ------------------------------------------------------------ hero: a title block, a media slot, two side panels */}
        <section className="lp-hero" data-hero aria-label="Synovra Battery Intelligence">
          <div className="lp-hero-main">
            <div className="lp-hero-title">
              <h1 className="lp-h1">
                <span className="lp-line"><span data-line style={{ ['--i' as string]: 0 }}>Every battery,</span></span>{' '}
                <span className="lp-line"><span data-line style={{ ['--i' as string]: 1 }}>on the record.</span></span>
              </h1>
              <div className="lp-hero-side" data-rise style={{ ['--i' as string]: 2 }}>
                <p className="lp-sub">See how every lead-acid battery is doing, why, and what happens next. Each battery keeps one record from its first test to recycling.</p>
                <div className="lp-cta-row">
                  <Link className="lp-btn" href="/signin" data-magnet>Open the demo</Link>
                  <a className="lp-textlink" href="#platform">Explore the platform <span aria-hidden>↓</span></a>
                </div>
              </div>
            </div>
            <Slot
              name="hero-media" kind="video" ratio="16 / 9" dark src="/landing/slots/hero-media.mp4" poster="/landing/slots/hero-media.jpg"
              note="Video: a battery and its record, from a site to a decision."
            />
            <div className="lp-notes" aria-label="What the product holds to" data-rise style={{ ['--i' as string]: 4 }}>
              {NOTES.map(([t, d], i) => (
                <p key={t} className="lp-note" style={{ ['--k' as string]: i }}><b>{t}</b><span>{d}</span></p>
              ))}
            </div>
          </div>
          <aside className="lp-hero-rail">
            <div className="lp-rail-tag" data-rise style={{ ['--i' as string]: 3 }}>
              <p>Every claim on a battery’s record points to the evidence behind it.</p>
            </div>
            <section className="lp-status" aria-labelledby="status-h" data-rise style={{ ['--i' as string]: 4 }}>
              <h2 id="status-h">Record coverage</h2>
              <ul data-fluid="y" className="lp-status-list">
                {COVERAGE.map(([name, state, kind], i) => (
                  <li key={name}>
                    <span data-fluid-item tabIndex={0} className="lp-status-row">
                      <span className="lp-status-n">{String(i + 1).padStart(2, '0')}.</span>
                      <span className="lp-status-l">{name}</span>
                      <span className="lp-status-s" data-kind={kind}>{state}</span>
                      <i aria-hidden />
                    </span>
                  </li>
                ))}
              </ul>
              <div className="lp-hash" role="group" aria-label="Sample evidence checksums, synthetic">
                <span className="lp-hash-h">Evidence checksums · synthetic</span>
                {HASHES.map((h) => <span key={h}>{h}</span>)}
              </div>
              <p className="lp-status-foot">Synthetic demonstration. Nothing here is connected to a real battery.</p>
            </section>
          </aside>
        </section>

        {/* ------------------------------------------------------------ solutions: a row you can drag */}
        <section className="lp-solutions" id="solutions" aria-labelledby="sol-h">
          <div className="lp-sec-head">
            <p className="lp-eyebrow" data-reveal>For customers</p>
            <h2 id="sol-h" className="lp-h2" data-reveal style={{ ['--i' as string]: 1 }}>What you get</h2>
          </div>
          <Solutions items={SOLUTIONS} />
        </section>

        {/* ------------------------------------------------------------ platform: the parts, and the battery itself */}
        <section className="lp-platform" id="platform" aria-labelledby="plat-h">
          <div className="lp-sec-head">
            <p className="lp-eyebrow" data-reveal>The platform</p>
            <h2 id="plat-h" className="lp-h2" data-reveal style={{ ['--i' as string]: 1 }}>Explore the platform.</h2>
          </div>
          <div className="lp-plat-grid">
            <ul data-fluid="y" className="lp-plat-list" aria-label="What a battery's record is made of">
              {PLATFORM.map(([n, t, d, href]) => (
                <li key={n}>
                  <a data-fluid-item href={href} className="lp-plat-row">
                    <span className="lp-plat-n">{n}</span>
                    <span className="lp-plat-t">{t}</span>
                    <span className="lp-plat-d">{d}</span>
                  </a>
                </li>
              ))}
            </ul>
            <div className="lp-plat-twin">
              <Slot name="platform-twin" kind="component" ratio="17 / 8.5" note="Component: the battery as an interactive exploded view, state following its data.">
                <ExplodedBattery />
              </Slot>
              <p className="lp-plat-cap">Exploded view · illustration, not to scale. A battery’s data decides what its twin shows; none of it is modelled yet.</p>
            </div>
          </div>
        </section>

        <Lifecycle />

        {/* ------------------------------------------------------------ what it enforces */}
        <section className="lp-enf" id="enforces" aria-labelledby="enf-h">
          <div className="lp-enf-head">
            <p className="lp-eyebrow" data-reveal>How the record is kept</p>
            <h2 id="enf-h" className="lp-h2" data-reveal style={{ ['--i' as string]: 1 }}>What it enforces</h2>
            <p className="lp-lead" data-reveal style={{ ['--i' as string]: 2 }}>
              Four rules the record keeps. Each is shown here the way the product shows it.
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

        <QuestionList rows={QUESTIONS} pictures={PICTURES} />

        {/* ------------------------------------------------------------ about */}
        <section className="lp-about" id="honesty" aria-label="What is real in this demonstration">
          <div className="lp-letter">
            <span className="lp-letter-mark" data-reveal><Mark size={26} /></span>
            <p className="lp-letter-lead" data-reveal>
              This is a demonstration build, and it says so on every screen. The batteries, sites, people and figures in it are invented, and nothing connects to a live customer, cloud or sensor.
            </p>
            <p data-reveal>
              What is real is the record model and its rules: who may see what, what counts as evidence, and that approving a test is always a person&apos;s decision.
            </p>
            <p data-reveal>
              We built it for the people who run lead-acid batteries: the managers of depots, telecom rooms and battery banks who need to know how every battery is doing, and why.
            </p>
            <p data-reveal>
              Open it as a demonstration customer. The rules are checked on every read, so you see only your own sites. The same screens also run against the Synovra API, with PostgreSQL, company sign-in and stored evidence files.
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

        {/* ------------------------------------------------------------ the close: the first step, already open */}
        <section className="lp-cta" aria-labelledby="cta-h">
          <div className="lp-cta-text">
            <h2 id="cta-h" data-reveal>
              <span>Open your</span> <span>batteries.</span>
            </h2>
            <p data-reveal style={{ ['--i' as string]: 1 }}>
              Sign in to the demonstration as a customer. The button opens the home screen: how every battery is doing, what changed and what needs attention. Everything in it is synthetic.
            </p>
            <p data-reveal style={{ ['--i' as string]: 2 }}>
              <Link className="lp-btn" href="/signin?next=%2Fapp%2Fhome" data-magnet>Open the demo</Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="lp-foot" data-scene="enter">
        <div className="lp-foot-in" data-open>
          <div className="lp-foot-top">
            <div className="lp-foot-lead" data-f style={{ ['--i' as string]: 0 }}>
              <p className="lp-foot-tag">Every battery,<br /> on the record.</p>
              <p className="lp-foot-note">One record per lead-acid battery, from its first test to recycling. Every value says where it came from.</p>
            </div>
            <nav className="lp-foot-nav" aria-label="Footer" data-f style={{ ['--i' as string]: 1 }}>
              <div data-fluid="y">
                <p className="lp-foot-h">Explore</p>
                <Link data-fluid-item href="/signin">Demo sign-in<span className="lp-arr" aria-hidden>→</span></Link>
                <a data-fluid-item href="#platform">Platform<span className="lp-arr" aria-hidden>↑</span></a>
                <a data-fluid-item href="#honesty">What is real<span className="lp-arr" aria-hidden>↑</span></a>
              </div>
              <div data-fluid="y">
                <p className="lp-foot-h">Project</p>
                <a data-fluid-item href="https://github.com/KNambiarDJsc/Energy_Platform_Synovra" rel="noopener noreferrer">Source and docs<span className="lp-arr" aria-hidden>↗</span></a>
                <a data-fluid-item className="lp-totop" href="#main"><span aria-hidden>↑</span> Back to top</a>
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
