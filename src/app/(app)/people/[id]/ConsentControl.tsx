import { formatDate } from "@/lib/crm/dates";
import { setConsent } from "../actions";

export default function ConsentControl({
  personId,
  status,
  at,
  note,
}: {
  personId: string;
  status: string;
  at: string | null;
  note: string | null;
}) {
  const action = setConsent.bind(null, personId);
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-ink-soft">Marketing consent: </span>
        {status === "granted" ? (
          <span className="font-medium">Agreed on {formatDate(at)}</span>
        ) : status === "refused" ? (
          <span className="font-medium text-danger">Refused on {formatDate(at)}. Don&apos;t send them marketing</span>
        ) : (
          <span className="font-medium">Not recorded</span>
        )}
        {note && <span className="text-ink-soft"> ({note})</span>}
      </p>
      {status === "unknown" ? (
        <form action={action} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="consent-note">
            How did they say so?
          </label>
          <input
            id="consent-note"
            name="marketing_consent_note"
            maxLength={500}
            placeholder="How? e.g. said yes on WhatsApp"
            className="sm:max-w-72"
          />
          <button className="btn btn-ghost btn-sm" type="submit" name="marketing_consent" value="granted">
            They agreed
          </button>
          <button className="btn btn-ghost btn-sm" type="submit" name="marketing_consent" value="refused">
            They refused
          </button>
        </form>
      ) : (
        <form action={action}>
          <button className="btn btn-ghost btn-sm" type="submit" name="marketing_consent" value="unknown">
            Clear
          </button>
        </form>
      )}
    </div>
  );
}
