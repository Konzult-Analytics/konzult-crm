export default function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button className={`btn btn-ghost ${className}`} type="submit">
        Sign out
      </button>
    </form>
  );
}
