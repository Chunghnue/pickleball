"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookOpen, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";

const PAGE_SIZE = 9;

const CATEGORIES = [
  { value: "phan-mem", label: "Phần mềm" },
  { value: "kinh-doanh", label: "Kinh doanh" },
  { value: "xu-huong", label: "Xu hướng" },
  { value: "huong-dan", label: "Hướng dẫn" },
] as const;

interface BlogPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readingMinutes: number;
  publishedAt: string;
}

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

export default function BlogPage() {
  return (
    <>
      <PublicHeader />
      <Suspense>
        <BlogPageContent />
      </Suspense>
      <PublicFooter />
    </>
  );
}

function BlogPageContent() {
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState<BlogPostSummary[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [query, category]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (category) params.set("category", category);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      fetch(`/api/blog?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setPosts(Array.isArray(data.items) ? data.items : []);
          setTotal(typeof data.total === "number" ? data.total : 0);
        });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, category, page]);

  return (
    <main className="flex flex-1 flex-col">
      <section className="bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 px-4 pt-10 pb-8 text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          <nav className="flex items-center gap-1.5 text-sm text-white/60">
            <Link href="/" className="hover:text-white hover:underline">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="text-white/80">Blog</span>
          </nav>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold sm:text-4xl">
            <BookOpen className="size-7 shrink-0 sm:size-8" />
            Blog
          </h1>
          <p className="text-white/70">
            Kiến thức và xu hướng cho người chơi thể thao và chủ sân
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-5xl px-4">
        <div className="rounded-2xl bg-card p-5 shadow-md ring-1 ring-foreground/10">
          <div className="space-y-1.5">
            <Label
              htmlFor="query"
              className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              <Search className="size-3.5" />
              Tìm bài viết theo từ khóa...
            </Label>
            <Input
              id="query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={category === "" ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setCategory("")}
            >
              Tất cả
            </Button>
            {CATEGORIES.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={category === option.value ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setCategory(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8">
        {posts === null && <p className="text-muted-foreground">Đang tải...</p>}
        {posts !== null && posts.length === 0 && (
          <p className="text-muted-foreground">Không tìm thấy bài viết nào.</p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts?.map((post) => (
            <article
              key={post.id}
              className="flex h-full flex-col gap-2 rounded-2xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
                  {categoryLabel(post.category)}
                </span>
                <span>{formatDate(post.publishedAt)}</span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {post.readingMinutes} phút đọc
                </span>
              </div>
              <h3 className="font-bold">{post.title}</h3>
              <p className="flex-1 text-sm text-muted-foreground">{post.excerpt}</p>
              <Link
                href={`/blog/${post.slug}`}
                className="text-sm font-semibold text-green-700 hover:underline dark:text-green-400"
              >
                Đọc tiếp →
              </Link>
            </article>
          ))}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
            <span>{total} bài viết</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * PAGE_SIZE >= total}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
