import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t bg-muted/30 px-4 py-10 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:justify-between">
        <div>
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
            Pickleball
          </p>
          <p className="mt-1">Đặt sân pickleball nhanh chóng, dễ dàng.</p>
        </div>
        <div>
          <p className="font-semibold text-foreground">Khám phá</p>
          <Link
            href="/venues"
            className="mt-2 block hover:text-blue-600 dark:hover:text-blue-400"
          >
            Tìm sân
          </Link>
        </div>
        <div>
          <p className="font-semibold text-foreground">Liên hệ</p>
          <a
            href="mailto:chungdv84@gmail.com"
            className="mt-2 block hover:text-blue-600 dark:hover:text-blue-400"
          >
            chungdv84@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}
