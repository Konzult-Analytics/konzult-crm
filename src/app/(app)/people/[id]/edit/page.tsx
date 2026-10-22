import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMfaSession } from "@/lib/auth/guard";
import { organisationNames } from "@/lib/crm/lookups";
import { personName } from "@/lib/crm/people";
import { updatePerson } from "../../actions";
import PersonForm from "../../PersonForm";

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMfaSession();
  const [{ data: person }, organisations] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, first_name, last_name, email, phone, role_title, bni_chapter, is_bni_member, birthday, notes, organisations(name)"
      )
      .eq("id", id)
      .maybeSingle(),
    organisationNames(supabase),
  ]);
  if (!person) notFound();

  const { organisations: org, id: personId, ...values } = person;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/people/${personId}`} className="link text-sm">
        ← {personName(person)}
      </Link>
      <h1 className="text-2xl font-semibold">Edit {person.first_name}</h1>
      <PersonForm
        action={updatePerson.bind(null, personId)}
        values={{ ...values, organisation: org?.name ?? null }}
        organisations={organisations}
        submitLabel="Save changes"
      />
    </div>
  );
}
