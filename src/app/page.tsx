import Image from 'next/image';
import Link from 'next/link';
import { Brand } from '@/components/app/Brand';
import { DemoBanner } from '@/components/app/DemoBanner';
import { HeroReel, LookupSentence, Reveals, RulesDemo, StageSlider } from '@/components/landing/Interactive';
import './landing.css';

const QUESTIONS: { group: string; rows: [string, string][] }[] = [
  {
    group: 'Allocation',
    rows: [
      ['Which batteries are safe to allocate?', 'Qualified status, approved test'],
      ['On what evidence was this one qualified?', 'Test, protocol revision, reviewer'],
      ['Which units are waiting for an engineer?', 'Review queue'],
    ],
  },
  {
    group: 'History',
    rows: [
      ['What happened before it reached the site?', 'Passport timeline'],
      ['Where has it been installed, and when?', 'Movement history'],
      ['Who changed this record, and why?', 'Audit log, with reasons'],
    ],
  },
  {
    group: 'Cost and claims',
    rows: [
      ['What did restoring it cost?', 'Cost entries by basis'],
      ['Which costs are still missing?', 'Listed as unknown, never 0'],
      ['Is this a handling or a warranty issue?', 'Linked tests and telemetry'],
    ],
  },
  {
    group: 'End of life',
    rows: [
      ['Where did it go when it left service?', 'Consignment record'],
      ['Has the recycler confirmed it?', 'Certificate state'],
    ],
  },
];

const CREDITS = [
  { title: 'Open Lead acid battery', by: 'Sakar.solanki', licence: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/w/index.php?curid=23692756' },
  { title: 'Parabolic antennas on a telecommunications tower on Willans Hill', by: 'Bidgee', licence: 'CC BY-SA 2.5', url: 'https://commons.wikimedia.org/w/index.php?curid=10861456' },
  { title: 'Lead ingots', by: 'Rodw', licence: 'public domain', url: 'https://commons.wikimedia.org/wiki/File:Lead_ingots.JPG' },
  { title: 'Lead Ingots at Smelting Works Port Pirie (c. 1925)', by: 'South Australian State Government photographer', licence: 'public domain', url: 'https://commons.wikimedia.org/wiki/File:Lead_Ingots_at_Smelting_Works_Port_Pirie(GN07923).jpg' },
];

export default function LandingPage() {
  return (
    <div className="lp">
      <DemoBanner />
      <Reveals />
      <header className="lp-wrap">
        <nav className="lp-nav" aria-label="Site">
          <Brand />
          <ul>
            <li><a className="lp-link" href="#lifecycle">Lifecycle</a></li>
            <li><a className="lp-link" href="#rules">Rules</a></li>
            <li><a className="lp-link" href="#questions">Questions</a></li>
            <li><a className="lp-link" href="#honesty">What is real</a></li>
          </ul>
          <Link className="lp-btn" href="/signin">Demo sign-in</Link>
        </nav>
      </header>

      <main id="main">
        <HeroReel />

        <section className="lp-intro lp-wrap" aria-label="What Synovra is">
          <p className="lp-lead" data-reveal>
            Lead-acid fleets fail quietly. The test sits in one spreadsheet, the restoration in another, the approval in someone&apos;s inbox. Synovra keeps them on one record per battery, so anyone can see what was measured, what was done and who decided.
          </p>
          <div className="lp-cols">
            <p data-reveal style={{ ['--i' as string]: 0 }}><b>Who it is for.</b> Restoration teams, battery engineers and lab technicians who handle used lead-acid blocks, site operators who install them, and the customers who need to see what they are getting.</p>
            <p data-reveal style={{ ['--i' as string]: 1 }}><b>What it keeps.</b> A permanent identity, every test with its instrument and protocol, each restoration attempt, the engineer&apos;s decision, movements between sites, telemetry as measured or unknown, and the recycling handover.</p>
            <p data-reveal style={{ ['--i' as string]: 2 }}><b>Where it runs.</b> This demonstration runs in your browser on synthetic data. The same screens can run against the Synovra API with PostgreSQL, company sign-in and stored evidence files.</p>
            <p data-reveal style={{ ['--i' as string]: 3 }}><b>How to try it.</b> Open the demo and pick a role. A battery engineer, a technician and a customer auditor see the same battery differently, because the rules are enforced on every read and write.</p>
          </div>
        </section>

        <figure className="lp-pic">
          <div className="lp-band" data-open>
            <Image src="/landing/open-lead-acid-battery.jpg" alt="A lead-acid battery cut open to show its six cells of lead plates, with test leads clipped to the terminals" width={1920} height={1173} sizes="100vw" loading="eager" />
          </div>
          <figcaption>Inside a lead-acid battery: six cells of lead plates. A passport starts with what was measured across them.</figcaption>
        </figure>

        <StageSlider />

        <RulesDemo />

        <section className="lp-q" id="questions" aria-labelledby="q-h">
          <div className="lp-q-list">
            <h2 id="q-h" data-reveal>Questions it answers</h2>
            {QUESTIONS.map((g, gi) => (
              <div key={g.group} data-reveal style={{ ['--i' as string]: gi }}>
                <h3>{g.group}</h3>
                <ul>
                  {g.rows.map(([q, where], ri) => (
                    <li key={q} data-reveal style={{ ['--i' as string]: ri }}><span>{q}</span><span>{where}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <figure className="lp-pic lp-q-pic" data-reveal>
            <Image src="/landing/telecom-tower.jpg" alt="Microwave dishes on a lattice telecommunications tower against a grey sky" width={1920} height={1277} sizes="(max-width: 1100px) 100vw, 420px" />
            <figcaption>Where such batteries work: backup power at sites like this one. Not a Synovra site.</figcaption>
          </figure>
        </section>

        <section className="lp-about" id="honesty" aria-label="What is real in this demonstration">
          <div className="lp-about-row">
            <dl className="lp-facts" data-reveal>
              <div><dt>Data</dt><dd>Synthetic, generated in the browser</dd></div>
              <div><dt>Sign-in</dt><dd>Demo roles, no passwords</dd></div>
              <div><dt>Models</dt><dd>None trained; outputs labelled as demonstrations</dd></div>
            </dl>
            <div className="lp-about-text">
              <p data-reveal>
                This is a demonstration build, and it says so on every screen. The batteries, sites, people and figures are invented, and nothing connects to a live customer, cloud or sensor. What is real is the record model and its rules: who may see what, what counts as evidence, and that qualifying a battery is always a person&apos;s decision.
              </p>
              <div className="lp-about-pics">
                <figure className="lp-pic" data-reveal style={{ ['--i' as string]: 1 }}>
                  <Image src="/landing/roman-lead-ingots.jpg" alt="Two Roman lead ingots in a museum case, cast with the emperor Vespasian's name along the top" width={1920} height={1440} sizes="(max-width: 900px) 100vw, 30vw" />
                  <figcaption style={{ padding: 0 }}>Roman lead, cast with the name of the emperor it was made under. Lead has carried its origin before.</figcaption>
                </figure>
              </div>
            </div>
          </div>
          <div className="lp-about-row">
            <p className="lp-word">The record</p>
            <div className="lp-lists">
              <div data-reveal>
                <h3>What this demonstration does not have</h3>
                <ul>
                  <li><span>Cloud platform and database</span><span>Browser only</span></li>
                  <li><span>Battery sensors and gateways</span><span>Generated</span></li>
                  <li><span>Trained machine-learning models</span><span>None</span></li>
                  <li><span>Identity provider</span><span>Demo roles</span></li>
                  <li><span>Certifications</span><span>None claimed</span></li>
                  <li><span>Customers</span><span>None; names invented</span></li>
                </ul>
              </div>
              <div data-reveal style={{ ['--i' as string]: 1 }}>
                <h3>What it enforces</h3>
                <ul>
                  <li><span>Role-based access</span><span>Every read and write</span></li>
                  <li><span>Audit with reasons</span><span>Refusals included</span></li>
                  <li><span>Customer view</span><span>Costs removed</span></li>
                  <li><span>Qualification</span><span>A person, with a reason</span></li>
                  <li><span>Missing cost</span><span>Unknown, never 0</span></li>
                  <li><span>QR code</span><span>Lookup only</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <figure className="lp-pic" data-reveal>
          <div className="lp-end">
            <Image src="/landing/port-pirie-ingots-1925.jpg" alt="Stacks of lead ingots in the yard of a smelting works, with water tanks and a chimney behind, around 1925" width={1920} height={1440} sizes="100vw" />
          </div>
          <figcaption className="lp-end-cap">Lead ingots at the Port Pirie smelting works, around 1925. Lead is recovered and recast; a passport closes with the consignment record and the recycler&apos;s certificate.</figcaption>
        </figure>

        <LookupSentence />
      </main>

      <footer>
        <p className="lp-credits">
          Pictures, none of them of Synovra or its customers:{' '}
          {CREDITS.map((c, i) => (
            <span key={c.url}>
              <a href={c.url} rel="noopener noreferrer" target="_blank">&ldquo;{c.title}&rdquo;</a> by {c.by}, {c.licence}, via Wikimedia Commons{i < CREDITS.length - 1 ? '; ' : '.'}
            </span>
          ))}
        </p>
        <div className="lp-foot">
          <span>Synovra Battery Intelligence, demonstration build</span>
          <nav aria-label="Footer">
            <Link className="lp-link" href="/signin">Demo sign-in</Link>
            <a className="lp-link" href="#honesty">What is real</a>
            <a className="lp-link" href="https://github.com/KNambiarDJsc/Energy_Platform_Synovra" rel="noopener noreferrer">Source and docs</a>
          </nav>
          <span>Synthetic data. No customer, savings or accuracy claims.</span>
        </div>
      </footer>
    </div>
  );
}
