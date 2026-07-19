"use client";

// Submits its own form whenever any field inside it changes — for settings
// (like the region picker) where a separate "Save" click is easy to skip,
// leading to "I picked a value but it says I haven't" confusion.
export function AutoSubmitForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      className={className}
      onChange={(e) => e.currentTarget.requestSubmit()}
    >
      {children}
    </form>
  );
}
