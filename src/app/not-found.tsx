import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="wrap flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="rounded-full bg-parchment p-4 text-fern">
        <Compass size={26} />
      </span>
      <p className="eyebrow mt-5">404 · Pallet not found</p>
      <h1 className="display mt-2 text-[36px] leading-tight sm:text-[44px]">
        That aisle does not exist.
      </h1>
      <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-ink/72">
        The page or SKU you were looking for has moved. The catalog, trade program and quick order
        panel are all one click away.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/shop" className="btn btn-primary btn-sm">
          Browse the catalog <ArrowRight size={13} />
        </Link>
        <Link href="/wholesale" className="btn btn-outline btn-sm">Wholesale program</Link>
        <Link href="/quick-order" className="btn btn-outline btn-sm">Quick order</Link>
      </div>
    </div>
  );
}
