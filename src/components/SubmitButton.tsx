"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pending,
  className = "btn btn-accent",
}: {
  children: React.ReactNode;
  pending: string;
  className?: string;
}) {
  const status = useFormStatus();
  return (
    <button className={className} type="submit" disabled={status.pending}>
      {status.pending ? pending : children}
    </button>
  );
}
