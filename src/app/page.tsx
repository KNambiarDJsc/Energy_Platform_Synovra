import {
  ArrowRight, BadgeCheck, CheckCircle2, ClipboardCheck, FileSearch, FlaskConical, History, KeyRound, Lock, MapPin, Recycle,
  Radio, ShieldCheck, Wrench, XCircle, ScrollText, Fingerprint,
} from 'lucide-react';
import Link from 'next/link';
import { Brand } from '@/components/app/Brand';
import { DemoBanner } from '@/components/app/DemoBanner';
import { buttonClass } from '@/components/ui/buttonClass';

const LIFECYCLE = [
  { icon: ClipboardCheck, name: 'Intake', text: 'Register the battery once, with a permanent identity and its source records.' },
  { icon: FlaskConical, name: 'Test', text: 'Record measurements with instrument, calibration reference and protocol revision.' },
  { icon: Wrench, name: 'Restore', text: 'Keep each attempt, its lot references and before/after tests under the same identity.' },
  { icon: BadgeCheck, name: 'Qualify', text: 'An engineer reviews the evidence and decides. The rule check informs; it never approves.' },
  { icon: MapPin, name: 'Deploy', text: 'Assign to a site slot with overlap prevention and a movement history.' },
  { icon: Radio, name: 'Monitor', text: 'Telemetry arrives as measured, inferred or unknown, with gaps left visible.' },
  { icon: Recycle, name: 'Recycle', text: 'Consignment and certificate state are recorded when the battery leaves service.' },
];

const NOT_CONNECTED = [
  { item: 'Cloud platform and database', state: 'Not connected. Data lives in this browser only.' },
  { item: 'Battery sensors and gateways', state: 'Not connected. Telemetry is generated for the demonstration.' },
  { item: 'Machine-learning models', state: 'No trained model. Outputs are labelled demonstration output in shadow mode.' },
  { item: 'Identity provider', state: 'Not connected. Sign-in selects a demo role; there are no passwords.' },
  { item: 'Certifications and customers', state: 'None claimed. Names, sites and figures are invented.' },
];

export default function LandingPage() {
  return (
    <div className="bg-white">
      <DemoBanner />
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Brand />
          <nav aria-label="Site" className="hidden items-center gap-6 text-sm font-medium text-ink md:flex">
            <a href="#product" className="hover:text-teal-800">Product</a>
            <a href="#lifecycle" className="hover:text-teal-800">Lifecycle</a>
            <a href="#value" className="hover:text-teal-800">Value</a>
            <a href="#trust" className="hover:text-teal-800">Trust</a>
          </nav>
          <Link href="/signin" className={buttonClass('secondary', 'md')}>
            Demo sign-in
          </Link>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="bg-canvas">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-[1.15fr_1fr] md:px-6 md:py-20">
            <div>
              <p className="eyebrow">Lead-acid battery lifecycle platform · Demonstration build</p>
              <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-navy md:text-5xl">
                Give every battery a verifiable operational history.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ink">
                One passport for each battery, from intake and testing through restoration, deployment, monitoring and recycling. Every claim points back to the record that supports it, and every decision names the person who made it.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/signin" className={buttonClass('primary', 'md', 'px-6')}>
                  View product demo <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
                <Link href="/signin?next=%2Fapp%2Fscan%3Flabel%3DB-0002" className={buttonClass('secondary', 'md', 'px-6')}>
                  Explore a battery passport
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">
                Runs on synthetic data in your browser. No account, no live customer, cloud or sensor connection.
              </p>
            </div>

            {/* Illustrative passport card, clearly marked synthetic */}
            <figure className="card relative overflow-hidden p-5 shadow-pop" aria-label="Illustration of a battery passport with synthetic data">
              <div className="flex items-center justify-between">
                <div>
                  <p className="eyebrow">Battery passport</p>
                  <p className="mt-0.5 text-xl font-semibold text-navy">B-0002</p>
                  <p className="text-sm text-muted">AV-12-200 FT · 12 V / 200 Ah AGM</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#BFDCCB] bg-approved-50 px-2.5 py-1 text-xs font-semibold text-approved-700">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Qualified under protocol
                </span>
              </div>
              <ol className="mt-5 space-y-4 border-l-2 border-line pl-5">
                {[
                  ['Received', 'Serial recorded, identity created', 'neutral'],
                  ['Initial test', '120 Ah measured (60% of rated)', 'neutral'],
                  ['Restoration attempt 1', 'Lot references and notes kept', 'neutral'],
                  ['Final test', '174 Ah measured (87% of rated)', 'neutral'],
                  ['Engineer review', 'Approved with reason, evidence attached', 'ok'],
                ].map(([t, d, k]) => (
                  <li key={t} className="relative">
                    <span
                      className={`absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-white ${k === 'ok' ? 'bg-approved' : 'bg-teal'}`}
                      aria-hidden
                    />
                    <p className="text-sm font-semibold text-navy">{t}</p>
                    <p className="text-sm text-muted">{d}</p>
                  </li>
                ))}
              </ol>
              <figcaption className="mt-5 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
                Synthetic example. Not a real battery or customer.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Product */}
        <section id="product" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 className="text-3xl font-semibold text-navy">What the platform keeps straight</h2>
          <p className="mt-3 max-w-3xl text-lg text-ink">
            Lead-acid fleets fail quietly when identity, evidence and decisions live in different spreadsheets. The platform keeps three things apart so each can be trusted.
          </p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              { icon: Fingerprint, t: 'Identity', d: 'A permanent internal ID, a printed label, a QR lookup reference and the manufacturer serial are separate fields. A QR code finds a record; it never grants access to it. Restoration keeps the identity. A physical replacement gets a new one, linked.' },
              { icon: FileSearch, t: 'Evidence', d: 'Tests carry instrument, calibration, conditions and operator. Photos and reports attach to the event they support. Missing data is shown as unknown and listed, not filled in.' },
              { icon: ShieldCheck, t: 'Decisions', d: 'Qualification is a person’s decision with a recorded reason. Rule checks, model estimates and measurements are labelled differently so a reader can tell which is which.' },
            ].map((c) => (
              <article key={c.t} className="card p-5">
                <c.icon className="h-6 w-6 text-teal" aria-hidden />
                <h3 className="mt-3 text-lg font-semibold text-navy">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink">{c.d}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Lifecycle */}
        <section id="lifecycle" className="bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <h2 className="text-3xl font-semibold text-navy">One continuous record across the lifecycle</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {LIFECYCLE.map((s, i) => (
                <li key={s.name} className="card relative p-4">
                  <span className="text-xs font-semibold text-muted">Step {i + 1}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <s.icon className="h-5 w-5 text-teal" aria-hidden />
                    <h3 className="text-base font-semibold text-navy">{s.name}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Value */}
        <section id="value" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 className="text-3xl font-semibold text-navy">What a team can answer without a spreadsheet hunt</h2>
          <p className="mt-3 max-w-3xl text-ink">
            These are capabilities of the workflow, not measured savings. This demonstration contains no real cost or performance results.
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              ['Which batteries are safe to allocate, and on what evidence?', 'Qualified status always shows the approved test, protocol revision and the reviewer.'],
              ['What happened to this unit before it reached the site?', 'Intake, tests, restoration attempts and movements sit on one timeline with dates and sources.'],
              ['Is this a warranty issue or a handling issue?', 'Claims link to the test and telemetry evidence on the passport. Unknown causes stay unknown.'],
              ['What does a restored battery really cost?', 'Costs are listed by entry and basis. A missing cost stays unknown and is never counted as zero.'],
            ].map(([q, a]) => (
              <li key={q} className="card flex gap-3 p-5">
                <History className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden />
                <div>
                  <h3 className="text-base font-semibold text-navy">{q}</h3>
                  <p className="mt-1 text-sm text-ink">{a}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Trust */}
        <section id="trust" className="bg-navy text-white">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
            <h2 className="text-3xl font-semibold">Built to be checked, not just believed</h2>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <ul className="space-y-4">
                {[
                  [KeyRound, 'Role-based access enforced where data is read and written, not only hidden in the interface.'],
                  [ScrollText, 'Every consequential action records who, when and why, including actions that were refused.'],
                  [Lock, 'Customers see their own batteries with internal costs and controlled process data removed.'],
                  [ShieldCheck, 'Approval stays human. An administrator cannot approve qualification; a rule result never does.'],
                ].map(([Icon, text]) => {
                  const I = Icon as typeof Lock;
                  return (
                    <li key={text as string} className="flex gap-3">
                      <I className="mt-0.5 h-5 w-5 shrink-0 text-[#2DB8BD]" aria-hidden />
                      <span className="text-[#E6EEF2]">{text as string}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-lg border border-[#2B4C63] bg-[#173A55] p-5">
                <h3 className="text-base font-semibold">What this demonstration does not have</h3>
                <dl className="mt-3 space-y-3 text-sm">
                  {NOT_CONNECTED.map((n) => (
                    <div key={n.item}>
                      <dt className="flex gap-2 font-medium">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F2B8B8]" aria-hidden />
                        {n.item}
                      </dt>
                      <dd className="pl-6 text-[#C9D8E0]">{n.state}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 flex items-start gap-2 text-sm text-[#C9D8E0]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2DB8BD]" aria-hidden />
                  Service interfaces are defined so a real backend can replace the mock layer without changing screens.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 text-center md:px-6">
          <h2 className="text-2xl font-semibold text-navy">See it as a battery engineer, a technician or a customer</h2>
          <p className="mx-auto mt-2 max-w-2xl text-ink">Seven demo roles show how the same record is presented, and restricted, for different people.</p>
          <div className="mt-6">
            <Link href="/signin" className={buttonClass('primary', 'md', 'px-6')}>
              Open the demo <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm md:grid-cols-4 md:px-6">
          <div>
            <Brand />
            <p className="mt-3 text-muted">Synovra Battery Intelligence</p>
          </div>
          <div>
            <h2 className="font-semibold text-navy">Product</h2>
            <ul className="mt-2 space-y-1.5 text-ink">
              <li><a href="#product" className="hover:underline">What it keeps straight</a></li>
              <li><a href="#lifecycle" className="hover:underline">Lifecycle</a></li>
              <li><Link href="/signin" className="hover:underline">Demo sign-in</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold text-navy">Security</h2>
            <ul className="mt-2 space-y-1.5 text-ink">
              <li><a href="#trust" className="hover:underline">Access model and audit</a></li>
              <li><a href="#trust" className="hover:underline">What is not connected</a></li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold text-navy">Documentation and contact</h2>
            <p className="mt-2 text-ink">
              Setup, route map, data model and integration points are in the repository README and docs folder. No contact channel is configured for this demonstration.
            </p>
          </div>
        </div>
        <p className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          Synthetic demonstration data. Not a certified product. No customer, savings or accuracy claims are made.
        </p>
      </footer>
    </div>
  );
}
