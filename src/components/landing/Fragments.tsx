/**
 * Cropped, working pieces of the product's interface, built in HTML at true size.
 * Each root carries `data-ui`: inside it the product's own conventions apply (control borders, chips).
 */
import { B0002, pct } from './b0002';

function Head({ status, tone = 'neutral' }: { status: string; tone?: 'neutral' | 'ok' | 'wait' }) {
  return (
    <div className="ui-head">
      <div>
        <p className="ui-label">{B0002.label}</p>
        <p className="ui-sub">{B0002.model} · {B0002.spec}</p>
      </div>
      <span className={`ui-chip ui-chip-${tone}`}>{status}</span>
    </div>
  );
}

function Row({ k, v, unknown }: { k: string; v: string; unknown?: boolean }) {
  return (
    <div className="ui-row">
      <dt>{k}</dt>
      <dd className={unknown ? 'ui-unknown' : undefined}>{v}</dd>
    </div>
  );
}

export function IdentityFragment() {
  return (
    <div data-ui className="ui-frag">
      <Head status="Received" />
      <dl className="ui-rows">
        <Row k="Internal ID" v="bat_0002 (permanent)" />
        <Row k="Printed label" v={B0002.label} />
        <Row k="QR lookup ref" v={B0002.lookupRef} />
        <Row k="Manufacturer serial" v={B0002.serial} />
      </dl>
      <p className="ui-note">A QR code finds this record. It does not grant access to it.</p>
    </div>
  );
}

export function TestFragment({ kind }: { kind: 'initial' | 'final' }) {
  const ah = kind === 'initial' ? B0002.initialAh : B0002.finalAh;
  return (
    <div data-ui className="ui-frag">
      <Head status={kind === 'initial' ? 'Initial test' : 'Final test'} />
      <div className="ui-measure">
        <p><span className="ui-big">{ah} Ah</span> measured</p>
        <p className="ui-sub">{pct(ah)}% of {B0002.ratedAh} Ah rated</p>
        <div className="ui-bar" role="img" aria-label={`${pct(ah)} percent of rated capacity`}>
          <span style={{ width: `${pct(ah)}%` }} />
          <i style={{ left: `${B0002.thresholdPct}%` }} aria-hidden />
        </div>
      </div>
      <dl className="ui-rows">
        <Row k="Instrument" v={`${B0002.instrument} · ${B0002.calibration}`} />
        <Row k="Ambient temperature" v="Unknown (not recorded)" unknown />
      </dl>
    </div>
  );
}

export function RestoreFragment({ materialsEntered = false }: { materialsEntered?: boolean }) {
  return (
    <div data-ui className="ui-frag">
      <Head status="Restoration attempt 1" tone="wait" />
      <dl className="ui-rows">
        <Row k="Lot references" v="LOT-DEMO-0419, LOT-DEMO-0422" />
        <Row k="Bench time" v="AED 48 (allocated)" />
        <Row k="Inputs" v={materialsEntered ? 'AED 96 (allocated)' : 'Unknown (not yet allocated)'} unknown={!materialsEntered} />
        <Row k="Attempt cost" v={materialsEntered ? 'AED 144' : 'Unknown, 1 entry missing'} unknown={!materialsEntered} />
      </dl>
      <p className="ui-note">A missing cost is listed, never counted as zero.</p>
    </div>
  );
}

export function DecisionFragment() {
  return (
    <div data-ui className="ui-frag">
      <Head status="Qualified" tone="ok" />
      <dl className="ui-rows">
        <Row k="Rule check" v={`Final ${pct(B0002.finalAh)}% ≥ ${B0002.thresholdPct}% demo threshold (informs only)`} />
        <Row k="Decision" v="Approved by a battery engineer" />
        <Row k="Reason" v="Result matches bench log; conditions per protocol." />
      </dl>
      <p className="ui-note">An administrator cannot approve. Neither can the rule.</p>
    </div>
  );
}

export function StageFragment({ stage }: { stage: 'intake' | 'test' | 'restore' | 'qualify' }) {
  if (stage === 'intake') return <IdentityFragment />;
  if (stage === 'test') return <TestFragment kind="initial" />;
  if (stage === 'restore') return <RestoreFragment />;
  return <DecisionFragment />;
}
