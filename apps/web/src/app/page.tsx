import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Pickleball</h1>
      <p className="text-muted-foreground">
        Đặt sân pickleball nhanh chóng, dễ dàng.
      </p>
      <div className="flex gap-4">
        <Link href="/login" className={buttonVariants()}>
          Đăng nhập
        </Link>
        <Link href="/register" className={buttonVariants({ variant: "outline" })}>
          Đăng ký
        </Link>
      </div>
    </main>
  );
}
