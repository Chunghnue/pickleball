"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { CalendarDays, Clock } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";

const CATEGORIES = [
  { value: "phan-mem", label: "Phần mềm" },
  { value: "kinh-doanh", label: "Kinh doanh" },
  { value: "xu-huong", label: "Xu hướng" },
  { value: "huong-dan", label: "Hướng dẫn" },
] as const;

function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN");
}

interface BlogPostDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  readingMinutes: number;
  publishedAt: string;
  coverImageUrl: string | null;
}

export default function BlogDetailPage() {
  const params = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostDetail | null | "not-found">(null);

  useEffect(() => {
    fetch(`/api/blog/${params.slug}`).then(async (res) => {
      if (res.status === 404) {
        setPost("not-found");
        return;
      }
      const data = await res.json();
      setPost(data as BlogPostDetail);
    });
  }, [params.slug]);

  if (post === "not-found") {
    notFound();
  }

  if (!post) {
    return (
      <>
        <PublicHeader />
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-muted-foreground">Đang tải...</p>
        </div>
        <PublicFooter />
      </>
    );
  }

  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/" className="hover:underline">
            Trang chủ
          </Link>
          <span>›</span>
          <Link href="/blog" className="hover:underline">
            Blog
          </Link>
          <span>›</span>
          <span className="text-foreground">{post.title}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-green-50 px-2.5 py-1 font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
            {categoryLabel(post.category)}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {formatDate(post.publishedAt)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {post.readingMinutes} phút đọc
          </span>
        </div>

        <h1 className="text-3xl font-extrabold">{post.title}</h1>
        <p className="text-lg text-muted-foreground">{post.excerpt}</p>

        {post.coverImageUrl && (
          <img
            src={post.coverImageUrl}
            alt=""
            className="aspect-video w-full rounded-2xl object-cover"
          />
        )}

        <div className="prose max-w-none whitespace-pre-line dark:prose-invert">
          {post.content}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
