import SignOutButton from "@/components/SignOutButton";
import EnrollForm from "./EnrollForm";

export default function EnrollPage() {
  return (
    <div className="auth-card">
      <h1 className="text-2xl font-semibold">Set up two-factor</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Konzult CRM holds personal information, so every login needs a code from your phone as well
        as your password.
      </p>
      <EnrollForm />
      <SignOutButton className="mt-6 w-full" />
    </div>
  );
}
