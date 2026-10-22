import { requireMfaSession } from "@/lib/auth/guard";
import { organisationNames, personOptions, sourceOptions } from "@/lib/crm/lookups";
import { createPerson } from "../actions";
import PersonForm from "../PersonForm";

export default async function NewPersonPage() {
  const { supabase } = await requireMfaSession();
  const [organisations, sources, people] = await Promise.all([
    organisationNames(supabase),
    sourceOptions(supabase),
    personOptions(supabase),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Add someone</h1>
      <PersonForm
        action={createPerson}
        organisations={organisations}
        journey={{ sources, people }}
        submitLabel="Save person"
      />
    </div>
  );
}
