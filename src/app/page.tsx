import Link from 'next/link';
import type { ReactNode } from 'react';
import { DemoBanner } from '@/components/app/DemoBanner';
import { AuditProof, EvidenceProof, ReadingProof, RecyclingProof } from '@/components/landing/Fragments';
import { Lifecycle, OpenPassport, QuestionList, Reveals, RulesDemo, type Picture, type Question } from '@/components/landing/Interactive';
import './landing.css';

/** Real pictures of the world these batteries work in. None of them shows Synovra, its sites or its customers. */
const PICTURES: Picture[] = [
  {
    src: '/landing/telecom-tower.jpg', width: 1920, height: 1277, focus: '42% 50%',
    alt: 'Microwave dishes on a lattice telecommunications tower against a grey sky',
    caption: 'Backup batteries keep sites like this one running. Not a Synovra site.',
    title: 'Parabolic antennas on a telecommunications tower on Willans Hill', by: 'Bidgee',
    licence: 'CC BY-SA 2.5', licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.5/au/deed.en/',
    url: 'https://commons.wikimedia.org/w/index.php?curid=10861456',
  },
  {
    src: '/landing/open-lead-acid-battery.jpg', width: 1920, height: 1173, focus: '50% 50%',
    alt: 'A lead-acid battery cut open to show its six cells of lead plates, with test leads clipped to the terminals',
    caption: 'Inside a lead-acid battery: six cells of lead plates. A test measures across them.',
    title: 'Open Lead acid battery', by: 'Sakar.solanki',
    licence: 'CC BY-SA 3.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    url: 'https://commons.wikimedia.org/w/index.php?curid=23692756',
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

/** `pic` is the picture the question turns the photograph to. */
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

function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <rect x="1" y="5" width="26" height="20" rx="5" fill="#112B40" />
      <rect x="8" y="2" width="4" height="4" rx="1" fill="#007E83" />
      <rect x="16" y="2" width="4" height="4" rx="1" fill="#007E83" />
      <path d="M7 16.5h4l2.2-5 3 8 2.2-3H21" stroke="#5FD3D7" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The left half of the first screen, set like a card: the name, the promise, one action. */
function Sheet() {
  return (
    <div className="lp-sheet">
      <nav className="lp-top" aria-label="Site">
        <a className="lp-link" href="#lifecycle">How it works</a>
        <Link href="/" className="lp-mark" aria-label="Synovra Battery Intelligence, home">
          <Mark size={40} />
          <span>
            <span className="lp-mark-name">Synovra</span>
            <span className="lp-mark-sub">Battery Intelligence</span>
          </span>
        </Link>
        <Link className="lp-link" href="/signin">Demo sign-in</Link>
      </nav>
      <div className="lp-sheet-main">
        <h1>
          <span data-rise>Every battery,</span>{' '}
          <span data-rise style={{ ['--i' as string]: 1 }}>on the record.</span>
        </h1>
        <p data-rise style={{ ['--i' as string]: 2 }}>
          One passport for each lead-acid battery, from intake to recycling. Every claim on it points to the record behind it.
        </p>
        <Link className="lp-btn" href="/signin" data-rise style={{ ['--i' as string]: 3 }}>Open the demo</Link>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="lp">
      <DemoBanner />
      <Reveals />
      <main id="main">
        <Lifecycle sheet={<Sheet />} />

        <RulesDemo />

        <section className="lp-enf" aria-labelledby="enf-h">
          <div className="lp-enf-head">
            <h2 id="enf-h" data-reveal>What it enforces</h2>
            <p data-reveal style={{ ['--i' as string]: 1 }}>
              Beyond the rules you just tried, the record keeps four more. Each is shown here the way the product shows it.
            </p>
          </div>
          {RULES.map((r) => (
            <article className="lp-mod" key={r.title}>
              <div className="lp-mod-panel" data-reveal>{r.proof}</div>
              <div className="lp-mod-text">
                <h3 data-reveal style={{ ['--i' as string]: 1 }}>{r.title}</h3>
                <p data-reveal style={{ ['--i' as string]: 2 }}>{r.text}</p>
                <p data-reveal style={{ ['--i' as string]: 3 }}>{r.aside}</p>
              </div>
            </article>
          ))}
        </section>

        <QuestionList rows={QUESTIONS} pictures={PICTURES} />

        <section className="lp-about" id="honesty" aria-label="What is real in this demonstration">
          <div className="lp-letter">
            <span className="lp-letter-mark" data-reveal><Mark size={26} /></span>
            <p data-reveal>
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
                <li key={what}><span>{what}</span><span>{state}</span></li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="cta-h">
          <div className="lp-cta-text">
            <h2 id="cta-h" data-reveal>
              <span>Open a</span> <span>passport.</span>
            </h2>
            <p data-reveal style={{ ['--i' as string]: 1 }}>
              Choose a label and a reader. The button signs you in to the demonstration as that role and opens the battery&apos;s passport. Everything in it is synthetic.
            </p>
          </div>
          <OpenPassport />
        </section>
      </main>

      <footer className="lp-foot">
        <span>Synovra Battery Intelligence, demonstration build</span>
        <nav aria-label="Footer">
          <Link className="lp-link" href="/signin">Demo sign-in</Link>
          <a className="lp-link" href="#honesty">What is real</a>
          <a className="lp-link" href="https://github.com/KNambiarDJsc/Energy_Platform_Synovra" rel="noopener noreferrer">Source and docs</a>
        </nav>
        <span>2026 · Synthetic data only</span>
      </footer>
    </div>
  );
}
