import Link from "next/link";

export function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-slate-900 px-4 pt-12 pb-6 text-sm text-slate-400">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 sm:flex-row sm:justify-between">
        <div className="max-w-xs">
          <p className="text-lg font-bold text-white">
            Pickle<span className="text-green-400">ball</span>
          </p>
          <p className="mt-3">
            Nền tảng đặt sân pickleball trực tuyến. Tìm và đặt sân trống gần
            bạn chỉ trong vài giây.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Khám phá
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/venues" className="hover:text-green-400">
              Tìm sân
            </Link>
            <Link href="/ban-do" className="hover:text-green-400">
              Bản đồ
            </Link>
            <Link href="/blog" className="hover:text-green-400">
              Blog
            </Link>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Liên hệ
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <a
              href="mailto:chungdv84@gmail.com"
              className="hover:text-green-400"
            >
              chungdv84@gmail.com
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-7xl flex-col gap-2 border-t border-slate-800 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Pickleball. All rights reserved.</p>
        <p>
          Đăng ký chủ sân?{" "}
          <Link
            href="/register/owner"
            className="font-medium text-green-400 hover:underline"
          >
            Liên hệ ngay
          </Link>
        </p>
      </div>
    </footer>
  );
}
