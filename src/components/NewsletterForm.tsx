"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-cream/25 bg-cream/10 px-4 py-3 text-[12px] text-cream">
        <Check size={15} /> On the list — first look lands Thursday.
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (email.includes("@")) setDone(true);
      }}
      className="flex items-center gap-2 border-b border-cream/30 pb-2"
    >
      <input aria-label="Email address"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Buyer email address"
        className="w-full bg-transparent text-sm text-cream placeholder:text-cream/50 focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Subscribe"
        className="rounded-full bg-cream p-2 text-ink transition-colors hover:bg-white"
      >
        <ArrowRight size={15} />
      </button>
    </form>
  );
}
