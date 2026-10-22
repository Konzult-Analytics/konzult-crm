import { requireMfaSession } from "@/lib/auth/guard";
import ImportFlow from "./ImportFlow";

export default async function ImportPage() {
  await requireMfaSession();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Import contacts</h1>
      <ImportFlow />
    </div>
  );
}
